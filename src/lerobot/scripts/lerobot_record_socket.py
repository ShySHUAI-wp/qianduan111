import logging
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from pprint import pformat
from typing import Any


import socket
import threading

from lerobot.cameras import (  # noqa: F401
    CameraConfig,  # noqa: F401
)
from lerobot.cameras.opencv.configuration_opencv import OpenCVCameraConfig  # noqa: F401
from lerobot.cameras.realsense.configuration_realsense import RealSenseCameraConfig  # noqa: F401
from lerobot.configs import parser
from lerobot.configs.policies import PreTrainedConfig
from lerobot.datasets.image_writer import safe_stop_image_writer
from lerobot.datasets.lerobot_dataset import LeRobotDataset
from lerobot.datasets.pipeline_features import aggregate_pipeline_dataset_features, create_initial_features
from lerobot.datasets.utils import build_dataset_frame, combine_feature_dicts
from lerobot.datasets.video_utils import VideoEncodingManager
from lerobot.policies.factory import make_policy, make_pre_post_processors
from lerobot.policies.pretrained import PreTrainedPolicy
from lerobot.policies.utils import make_robot_action
from lerobot.processor import (
    PolicyAction,
    PolicyProcessorPipeline,
    RobotAction,
    RobotObservation,
    RobotProcessorPipeline,
    make_default_processors,
)
from lerobot.processor.rename_processor import rename_stats
from lerobot.robots import (  # noqa: F401
    Robot,
    RobotConfig,
    bi_so100_follower,
    earthrover_mini_plus,
    hope_jr,
    koch_follower,
    make_robot_from_config,
    omx_follower,
    so100_follower,
    so101_follower,
)
from lerobot.teleoperators import (  # noqa: F401
    Teleoperator,
    TeleoperatorConfig,
    bi_so100_leader,
    homunculus,
    koch_leader,
    make_teleoperator_from_config,
    omx_leader,
    so100_leader,
    so101_leader,
)
from lerobot.teleoperators.keyboard.teleop_keyboard import KeyboardTeleop
from lerobot.utils.constants import ACTION, OBS_STR
from lerobot.utils.control_utils import (
    init_keyboard_listener,
    is_headless,
    predict_action,
    sanity_check_dataset_name,
    sanity_check_dataset_robot_compatibility,
)
from lerobot.utils.import_utils import register_third_party_plugins
from lerobot.utils.robot_utils import precise_sleep
from lerobot.utils.utils import (
    get_safe_torch_device,
    init_logging,
    log_say,
)
from lerobot.utils.visualization_utils import init_rerun, log_rerun_data


@dataclass
class DatasetRecordConfig:
    # Dataset identifier. By convention it should match '{hf_username}/{dataset_name}' (e.g. `lerobot/test`).
    repo_id: str
    # A short but accurate description of the task performed during the recording (e.g. "Pick the Lego block and drop it in the box on the right.")
    single_task: str
    # Root directory where the dataset will be stored (e.g. 'dataset/path').
    root: str | Path | None = None
    # Limit the frames per second.
    fps: int = 30
    # Number of seconds for data recording for each episode.
    episode_time_s: int | float = 60
    # Number of seconds for resetting the environment after each episode.
    reset_time_s: int | float = 60
    # Number of episodes to record.
    num_episodes: int = 50
    # Encode frames in the dataset into video
    video: bool = True
    # Upload dataset to Hugging Face hub.
    push_to_hub: bool = True
    # Upload on private repository on the Hugging Face hub.
    private: bool = False
    # Add tags to your dataset on the hub.
    tags: list[str] | None = None
    # Number of subprocesses handling the saving of frames as PNG. Set to 0 to use threads only;
    # set to ≥1 to use subprocesses, each using threads to write images. The best number of processes
    # and threads depends on your system. We recommend 4 threads per camera with 0 processes.
    # If fps is unstable, adjust the thread count. If still unstable, try using 1 or more subprocesses.
    num_image_writer_processes: int = 0
    # Number of threads writing the frames as png images on disk, per camera.
    # Too many threads might cause unstable teleoperation fps due to main thread being blocked.
    # Not enough threads might cause low camera fps.
    num_image_writer_threads_per_camera: int = 4
    # Number of episodes to record before batch encoding videos
    # Set to 1 for immediate encoding (default behavior), or higher for batched encoding
    video_encoding_batch_size: int = 1
    # Rename map for the observation to override the image and state keys
    rename_map: dict[str, str] = field(default_factory=dict)

    def __post_init__(self):
        if self.single_task is None:
            raise ValueError("You need to provide a task as argument in `single_task`.")


@dataclass
class RecordConfig:
    robot: RobotConfig
    dataset: DatasetRecordConfig
    # Whether to control the robot with a teleoperator
    teleop: TeleoperatorConfig | None = None
    # Whether to control the robot with a policy
    policy: PreTrainedConfig | None = None
    # Display all cameras on screen
    display_data: bool = False
    # Display data on a remote Rerun server
    display_ip: str | None = None
    # Port of the remote Rerun server
    display_port: int | None = None
    # Whether to  display compressed images in Rerun
    display_compressed_images: bool = False
    # Use vocal synthesis to read events.
    play_sounds: bool = True
    # Resume recording on an existing dataset.
    resume: bool = False

    # 增加套接字属性
    socket_host: str = "0.0.0.0"
    socket_port: int = 9020
    socket_timeout: float = 5.0

    def __post_init__(self):
        # HACK: We parse again the cli args here to get the pretrained path if there was one.
        policy_path = parser.get_path_arg("policy")

        if policy_path:
            cli_overrides = parser.get_cli_overrides("policy")

            self.policy = PreTrainedConfig.from_pretrained(policy_path, cli_overrides=cli_overrides)
            self.policy.pretrained_path = policy_path

        if self.teleop is None and self.policy is None:
            raise ValueError("Choose a policy, a teleoperator or both to control the robot")

    @classmethod
    def __get_path_fields__(cls) -> list[str]:
        """This enables the parser to load config from the policy using `--policy.path=local/dir`"""
        return ["policy"]


""" --------------- record_loop() data flow --------------------------
       [ Robot ]
           V
     [ robot.get_observation() ] ---> raw_obs
           V
     [ robot_observation_processor ] ---> processed_obs
           V
     .-----( ACTION LOGIC )------------------.
     V                                       V
     [ From Teleoperator ]                   [ From Policy ]
     |                                       |
     |  [teleop.get_action] -> raw_action    |   [predict_action]
     |          |                            |          |
     |          V                            |          V
     | [teleop_action_processor]             |          |
     |          |                            |          |
     '---> processed_teleop_action           '---> processed_policy_action
     |                                       |
     '-------------------------.-------------'
                               V
                  [ robot_action_processor ] --> robot_action_to_send
                               V
                    [ robot.send_action() ] -- (Robot Executes)
                               V
                    ( Save to Dataset )
                               V
                  ( Rerun Log / Loop Wait )
"""


@safe_stop_image_writer
def record_loop(
    robot: Robot,
    events: dict,
    fps: int,
    teleop_action_processor: RobotProcessorPipeline[
        tuple[RobotAction, RobotObservation], RobotAction
    ],  # runs after teleop
    robot_action_processor: RobotProcessorPipeline[
        tuple[RobotAction, RobotObservation], RobotAction
    ],  # runs before robot
    robot_observation_processor: RobotProcessorPipeline[
        RobotObservation, RobotObservation
    ],  # runs after robot
    dataset: LeRobotDataset | None = None,
    teleop: Teleoperator | list[Teleoperator] | None = None,
    policy: PreTrainedPolicy | None = None,
    preprocessor: PolicyProcessorPipeline[dict[str, Any], dict[str, Any]] | None = None,
    postprocessor: PolicyProcessorPipeline[PolicyAction, PolicyAction] | None = None,
    control_time_s: int | None = None,
    single_task: str | None = None,
    display_data: bool = False,
    display_compressed_images: bool = False,
    client_socket_container: list = None,
    socket_lock: threading.Lock = None,
) -> str :  # 返回停止原因
    """返回停止原因: 'time_up', 'exit_early', 'stop_recording', 'rerecord_episode'"""
    if dataset is not None and dataset.fps != fps:
        raise ValueError(f"The dataset fps should be equal to requested fps ({dataset.fps} != {fps}).")

    teleop_arm = teleop_keyboard = None
    if isinstance(teleop, list):
        teleop_keyboard = next((t for t in teleop if isinstance(t, KeyboardTeleop)), None)
        teleop_arm = next(
            (
                t
                for t in teleop
                if isinstance(
                    t,
                    (
                        so100_leader.SO100Leader
                        | so101_leader.SO101Leader
                        | koch_leader.KochLeader
                        | omx_leader.OmxLeader
                        | bi_so100_leader.BiSO100Leader
                    ),
                )
            ),
            None,
        )

        if not (teleop_arm and teleop_keyboard and len(teleop) == 2 and robot.name == "lekiwi_client"):
            raise ValueError(
                "For multi-teleop, the list must contain exactly one KeyboardTeleop and one arm teleoperator. Currently only supported for LeKiwi robot."
            )

    # Reset policy and processor if they are provided
    if policy is not None and preprocessor is not None and postprocessor is not None:
        policy.reset()
        preprocessor.reset()
        postprocessor.reset()

    timestamp = 0
    start_episode_t = time.perf_counter()
    frame_count = 0
    progress_update_interval = fps  # 每秒发送一次进度更新

    while timestamp < control_time_s:
        start_loop_t = time.perf_counter()

        # 检查各种退出条件（优先级：stop > rerecord > exit_early > time_up）
        if events["stop_recording"]:
            return "stop_recording"

        if events["rerecord_episode"]:
            return "rerecord_episode"

        if events["exit_early"]:
            return "exit_early"

        # Get robot observation
        obs = robot.get_observation()

        # Applies a pipeline to the raw robot observation, default is IdentityProcessor
        obs_processed = robot_observation_processor(obs)

        if policy is not None or dataset is not None:
            observation_frame = build_dataset_frame(dataset.features, obs_processed, prefix=OBS_STR)

        # Get action from either policy or teleop
        if policy is not None and preprocessor is not None and postprocessor is not None:
            action_values = predict_action(
                observation=observation_frame,
                policy=policy,
                device=get_safe_torch_device(policy.config.device),
                preprocessor=preprocessor,
                postprocessor=postprocessor,
                use_amp=policy.config.use_amp,
                task=single_task,
                robot_type=robot.robot_type,
            )

            act_processed_policy: RobotAction = make_robot_action(action_values, dataset.features)

        elif policy is None and isinstance(teleop, Teleoperator):
            act = teleop.get_action()

            # Applies a pipeline to the raw teleop action, default is IdentityProcessor
            act_processed_teleop = teleop_action_processor((act, obs))

        elif policy is None and isinstance(teleop, list):
            arm_action = teleop_arm.get_action()
            arm_action = {f"arm_{k}": v for k, v in arm_action.items()}
            keyboard_action = teleop_keyboard.get_action()
            base_action = robot._from_keyboard_to_base_action(keyboard_action)
            act = {**arm_action, **base_action} if len(base_action) > 0 else arm_action
            act_processed_teleop = teleop_action_processor((act, obs))
        else:
            logging.info(
                "No policy or teleoperator provided, skipping action generation."
                "This is likely to happen when resetting the environment without a teleop device."
                "The robot won't be at its rest position at the start of the next episode."
            )
            continue

        # Applies a pipeline to the action, default is IdentityProcessor
        if policy is not None and act_processed_policy is not None:
            action_values = act_processed_policy
            robot_action_to_send = robot_action_processor((act_processed_policy, obs))
        else:
            action_values = act_processed_teleop
            robot_action_to_send = robot_action_processor((act_processed_teleop, obs))

        # Send action to robot
        # Action can eventually be clipped using `max_relative_target`,
        # so action actually sent is saved in the dataset. action = postprocessor.process(action)
        # TODO(steven, pepijn, adil): we should use a pipeline step to clip the action, so the sent action is the action that we input to the robot.
        _sent_action = robot.send_action(robot_action_to_send)

        # Write to dataset
        if dataset is not None:
            action_frame = build_dataset_frame(dataset.features, action_values, prefix=ACTION)
            frame = {**observation_frame, **action_frame, "task": single_task}
            dataset.add_frame(frame)

        if display_data:
            log_rerun_data(
                observation=obs_processed, action=action_values, compress_images=display_compressed_images
            )

        dt_s = time.perf_counter() - start_loop_t
        precise_sleep(max(1 / fps - dt_s, 0.0))

        timestamp = time.perf_counter() - start_episode_t
        frame_count += 1

        # 定期发送进度更新（每秒一次）
        if frame_count % progress_update_interval == 0 and client_socket_container and socket_lock:
            remaining_time = max(0, control_time_s - timestamp)
            progress_msg = f"progress|current:{timestamp:.2f}|total:{control_time_s}|remaining:{remaining_time:.2f}"
            try:
                with socket_lock:
                    client_sock = client_socket_container[0]
                    if client_sock and client_sock.fileno() != -1:
                        client_sock.sendall(f"{progress_msg}\n".encode("utf-8"))
            except Exception:
                pass

    return 'time_up'


@parser.wrap()
def record(cfg: RecordConfig) -> LeRobotDataset:
    init_logging()

    # 将 print 和 logging 输出同时写入日志文件
    import sys
    log_dir = Path(__file__).resolve().parents[4] / "fronter" / "fronter-backend" / "log"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file_path = log_dir / "record.log"
    _log_file = open(log_file_path, "a", encoding="utf-8", buffering=1)  # 行缓冲

    class _Tee:
        """同时写入原始流和日志文件"""
        def __init__(self, original, log_file):
            self._original = original
            self._log_file = log_file
        def write(self, data):
            self._original.write(data)
            try:
                self._log_file.write(data)
            except Exception:
                pass
        def flush(self):
            self._original.flush()
            try:
                self._log_file.flush()
            except Exception:
                pass

    sys.stdout = _Tee(sys.__stdout__, _log_file)
    sys.stderr = _Tee(sys.__stderr__, _log_file)

    # logging 也输出到日志文件
    file_handler = logging.FileHandler(log_file_path, mode="a", encoding="utf-8")
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s"))
    logging.getLogger().addHandler(file_handler)

    print("="*80)
    print("🚀 lerobot-record-socket 启动")
    print(f"📊 数据集: {cfg.dataset.repo_id}")
    print(f"🔌 Socket服务器: {cfg.socket_host}:{cfg.socket_port}")
    print("="*80)
    logging.info(pformat(asdict(cfg)))
    if cfg.display_data:
        init_rerun(session_name="recording", ip=cfg.display_ip, port=cfg.display_port)
    display_compressed_images = (
        True
        if (cfg.display_data and cfg.display_ip is not None and cfg.display_port is not None)
        else cfg.display_compressed_images
    )

    robot = make_robot_from_config(cfg.robot)
    teleop = make_teleoperator_from_config(cfg.teleop) if cfg.teleop is not None else None

    teleop_action_processor, robot_action_processor, robot_observation_processor = make_default_processors()

    dataset_features = combine_feature_dicts(
        aggregate_pipeline_dataset_features(
            pipeline=teleop_action_processor,
            initial_features=create_initial_features(
                action=robot.action_features
            ),  # TODO(steven, pepijn): in future this should be come from teleop or policy
            use_videos=cfg.dataset.video,
        ),
        aggregate_pipeline_dataset_features(
            pipeline=robot_observation_processor,
            initial_features=create_initial_features(observation=robot.observation_features),
            use_videos=cfg.dataset.video,
        ),
    )

    dataset = None
    client_socket_container = [None]  # 列表用于可变引用，跨线程共享
    socket_lock = threading.Lock()     # 锁解决多线程并发安全问题


    try:
        if cfg.resume:
            dataset = LeRobotDataset(
                cfg.dataset.repo_id,
                root=cfg.dataset.root,
                batch_encoding_size=cfg.dataset.video_encoding_batch_size,
            )

            if hasattr(robot, "cameras") and len(robot.cameras) > 0:
                dataset.start_image_writer(
                    num_processes=cfg.dataset.num_image_writer_processes,
                    num_threads=cfg.dataset.num_image_writer_threads_per_camera * len(robot.cameras),
                )
            sanity_check_dataset_robot_compatibility(dataset, robot, cfg.dataset.fps, dataset_features)
        else:
            # Create empty dataset or load existing saved episodes
            sanity_check_dataset_name(cfg.dataset.repo_id, cfg.policy)
            dataset = LeRobotDataset.create(
                cfg.dataset.repo_id,
                cfg.dataset.fps,
                root=cfg.dataset.root,
                robot_type=robot.name,
                features=dataset_features,
                use_videos=cfg.dataset.video,
                image_writer_processes=cfg.dataset.num_image_writer_processes,
                image_writer_threads=cfg.dataset.num_image_writer_threads_per_camera * len(robot.cameras),
                batch_encoding_size=cfg.dataset.video_encoding_batch_size,
            )

        # Load pretrained policy
        policy = None if cfg.policy is None else make_policy(cfg.policy, ds_meta=dataset.meta)
        preprocessor = None
        postprocessor = None
        if cfg.policy is not None:
            preprocessor, postprocessor = make_pre_post_processors(
                policy_cfg=cfg.policy,
                pretrained_path=cfg.policy.pretrained_path,
                dataset_stats=rename_stats(dataset.meta.stats, cfg.dataset.rename_map),
                preprocessor_overrides={
                    "device_processor": {"device": cfg.policy.device},
                    "rename_observations_processor": {"rename_map": cfg.dataset.rename_map},
                },
            )

        print("🔧 正在连接机器人...")
        robot.connect()
        print("✅ 机器人连接成功")
        if teleop is not None:
            print("🎮 正在连接遥操设备...")
            teleop.connect()
            print("✅ 遥操设备连接成功")

        # listener, events = init_keyboard_listener()

        # 初始化控制事件字典（与原有键盘事件结构完全一致，保证兼容）
        events = {
            "start_recording": False,
            "stop_recording": False,
            "rerecord_episode": False,
            "exit_early": False,
            "reset_done": False,
        }

        # 启动Socket指令监听线程（守护线程，主程序退出时自动关闭）
        print(f"📡 正在启动Socket服务器 {cfg.socket_host}:{cfg.socket_port}...")
        socket_thread = threading.Thread(
            target=socket_event_listener,
            args=(cfg.socket_host, cfg.socket_port, cfg.socket_timeout, events, client_socket_container, socket_lock),
            daemon=True
        )

        socket_thread.start()
        print("✅ Socket服务器线程已启动，等待客户端连接...")

        def _wait_for_reset(client_socket_container, socket_lock, events,
                            robot, teleop, teleop_action_processor, robot_action_processor,
                            robot_observation_processor, fps, dataset):
            """回正阶段：允许遥操机器人回到初始位置，不保存数据，等待 reset_done 指令"""
            events["reset_done"] = False
            resetting_interval = 2.0
            last_resetting_sent = 0.0
            print("🔄 进入回正阶段，遥操已启用，等待 reset_done 指令...")

            while not events["reset_done"] and not events["stop_recording"]:
                start_loop_t = time.perf_counter()

                # 周期性发送 resetting 消息
                now = time.perf_counter()
                if now - last_resetting_sent >= resetting_interval:
                    try:
                        with socket_lock:
                            client_sock = client_socket_container[0]
                            if client_sock and client_sock.fileno() != -1:
                                client_sock.sendall(b"resetting\n")
                                if last_resetting_sent == 0.0:
                                    print("📤 resetting 消息已发送，遥操回正中...")
                    except Exception:
                        pass
                    last_resetting_sent = now

                # 遥操循环：读取遥操动作并发送给机器人（不保存数据）
                if teleop is not None:
                    try:
                        obs = robot.get_observation()
                        obs_processed = robot_observation_processor(obs)
                        act = teleop.get_action()
                        act_processed = teleop_action_processor((act, obs))
                        robot_action_to_send = robot_action_processor((act_processed, obs))
                        robot.send_action(robot_action_to_send)
                    except Exception as e:
                        logging.debug(f"回正阶段遥操异常: {e}")

                dt_s = time.perf_counter() - start_loop_t
                precise_sleep(max(1 / fps - dt_s, 0.0))

            events["reset_done"] = False  # 重置标记
            # 清空缓冲区（回正阶段的遥操数据不保存）
            if dataset is not None:
                try:
                    dataset.clear_episode_buffer()
                    print("✅ 回正阶段缓冲已清空")
                except Exception:
                    pass
            if not events["stop_recording"]:
                print("✅ 回正完成，准备进入下一轮")

        with VideoEncodingManager(dataset):
            recorded_episodes = 0
            while True:
                # 检查终止条件
                if recorded_episodes >= cfg.dataset.num_episodes or events["stop_recording"]:
                    print(f"🎉 录制完成: {recorded_episodes}/{cfg.dataset.num_episodes} 轮")
                    print("📤 发送 record_finish 消息...")
                    try:
                        client_sock = client_socket_container[0]
                        if client_sock and client_sock.fileno() != -1:
                            client_sock.sendall(b"record_finish\n")
                            print("✅ record_finish 消息已发送")
                    except Exception as e:
                        print(f"❌ 发送 record_finish 失败: {e}")
                    break  # 结束主循环

                # 等待 start_recording 指令，期间周期性发送 ready 状态
                status_msg = f"ready|current:{recorded_episodes+1}|total:{cfg.dataset.num_episodes}"
                ready_interval = 2.0  # 每2秒重发一次 ready
                last_ready_sent = 0.0
                while not events["start_recording"] and not events["stop_recording"]:
                    now = time.perf_counter()
                    if now - last_ready_sent >= ready_interval:
                        try:
                            with socket_lock:
                                client_sock = client_socket_container[0]
                                if client_sock and client_sock.fileno() != -1:
                                    client_sock.sendall(f"{status_msg}\n".encode("utf-8"))
                                    if last_ready_sent == 0.0:
                                        print(f"📤 就绪状态已发送: {status_msg}，等待 start 指令...")
                        except Exception:
                            pass
                        last_ready_sent = now
                    precise_sleep(0.1)
                
                if events["stop_recording"]:
                    continue  # 回到循环开头，会触发终止条件
                    
                events["start_recording"] = False  # 重置标记

                log_say(f"Recording episode {dataset.num_episodes}", cfg.play_sounds)
                print(f"🎬 开始录制 Episode {dataset.num_episodes}")

                # 录制循环，返回结束原因
                stop_reason = record_loop(
                    robot=robot,
                    events=events,
                    fps=cfg.dataset.fps,
                    teleop_action_processor=teleop_action_processor,
                    robot_action_processor=robot_action_processor,
                    robot_observation_processor=robot_observation_processor,
                    teleop=teleop,
                    policy=policy,
                    preprocessor=preprocessor,
                    postprocessor=postprocessor,
                    dataset=dataset,
                    control_time_s=cfg.dataset.episode_time_s,
                    single_task=cfg.dataset.single_task,
                    display_data=cfg.display_data,
                    display_compressed_images=display_compressed_images,
                    client_socket_container=client_socket_container,
                    socket_lock=socket_lock,
                )

                # 处理不同的停止原因
                if events["stop_recording"]:
                    # 完全停止，不保存当前 episode
                    continue  # 回到循环开头，会触发终止

                elif events["exit_early"]:
                    # 提前结束，保存当前 episode，计入次数
                    log_say("Episode finished early", cfg.play_sounds)
                    print("⏭️ 提前结束当前轮次")

                    # 发送保存开始消息
                    print("📤 发送 saving_start 消息...")
                    try:
                        with socket_lock:
                            client_sock = client_socket_container[0]
                            if client_sock and client_sock.fileno() != -1:
                                client_sock.sendall(b"saving_start\n")
                                print("✅ saving_start 消息已发送")
                    except Exception as e:
                        print(f"❌ 发送 saving_start 失败: {e}")

                    print("💾 正在保存 episode 数据...")
                    dataset.save_episode()
                    print("✅ Episode 数据保存完成")

                    # 发送保存完成消息
                    print("📤 发送 saving_complete 消息...")
                    try:
                        with socket_lock:
                            client_sock = client_socket_container[0]
                            if client_sock and client_sock.fileno() != -1:
                                client_sock.sendall(b"saving_complete\n")
                                print("✅ saving_complete 消息已发送")
                    except Exception as e:
                        print(f"❌ 发送 saving_complete 失败: {e}")

                    recorded_episodes += 1
                    print(f"📊 已完成 {recorded_episodes}/{cfg.dataset.num_episodes} 轮")
                    events["exit_early"] = False  # 重置

                    # 回正阶段
                    _wait_for_reset(client_socket_container, socket_lock, events,
                                    robot, teleop, teleop_action_processor, robot_action_processor,
                                    robot_observation_processor, cfg.dataset.fps, dataset)
                    continue  # 开始下一轮

                elif events["rerecord_episode"]:
                    # 重录当前 episode，清空缓存，不计入次数
                    log_say("Re-record episode", cfg.play_sounds)
                    print("🔄 重新录制当前 episode，清空缓存...")
                    dataset.clear_episode_buffer()
                    print("✅ 缓存已清空，准备重新录制")
                    events["rerecord_episode"] = False  # 重置
                    events["exit_early"] = False  # 也重置这个

                    # 回正阶段
                    _wait_for_reset(client_socket_container, socket_lock, events,
                                    robot, teleop, teleop_action_processor, robot_action_processor,
                                    robot_observation_processor, cfg.dataset.fps, dataset)
                    continue  # 重新开始当前轮次，recorded_episodes 不加

                else:
                    # 正常完成（时间到了）
                    print("⏱️ 录制时间到，正常结束当前轮次")

                    # 发送保存开始消息
                    print("📤 发送 saving_start 消息...")
                    try:
                        with socket_lock:
                            client_sock = client_socket_container[0]
                            if client_sock and client_sock.fileno() != -1:
                                client_sock.sendall(b"saving_start\n")
                                print("✅ saving_start 消息已发送")
                    except Exception as e:
                        print(f"❌ 发送 saving_start 失败: {e}")

                    print("💾 正在保存 episode 数据...")
                    dataset.save_episode()
                    print("✅ Episode 数据保存完成")

                    # 发送保存完成消息
                    print("📤 发送 saving_complete 消息...")
                    try:
                        with socket_lock:
                            client_sock = client_socket_container[0]
                            if client_sock and client_sock.fileno() != -1:
                                client_sock.sendall(b"saving_complete\n")
                                print("✅ saving_complete 消息已发送")
                    except Exception as e:
                        print(f"❌ 发送 saving_complete 失败: {e}")

                    recorded_episodes += 1
                    print(f"📊 已完成 {recorded_episodes}/{cfg.dataset.num_episodes} 轮")

                    # 回正阶段
                    _wait_for_reset(client_socket_container, socket_lock, events,
                                    robot, teleop, teleop_action_processor, robot_action_processor,
                                    robot_observation_processor, cfg.dataset.fps, dataset)

    finally:
        with socket_lock:
            client_sock = client_socket_container[0]
            if client_sock and client_sock.fileno() != -1:
                try:
                    client_sock.close()
                    client_socket_container[0] = None
                    logging.info("已关闭客户端连接")
                except Exception:
                    pass

        log_say("Stop recording", cfg.play_sounds, blocking=True)

        if dataset:
            dataset.finalize()

        if robot.is_connected:
            robot.disconnect()
        if teleop and teleop.is_connected:
            teleop.disconnect()

        if cfg.dataset.push_to_hub:
            dataset.push_to_hub(tags=cfg.dataset.tags, private=cfg.dataset.private)

        log_say("Exiting", cfg.play_sounds)
        
    return dataset


def socket_event_listener(host: str, port: int, timeout: float, events: dict, client_socket_container: list, socket_lock: threading.Lock):
    """
    Socket服务端线程：监听网络指令，映射为录制控制事件
    支持指令：stop、rerecord、exit_early、start
    双向通信：保存客户端套接字，支持主线程主动推送状态
    """
    server_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server_sock.settimeout(timeout)
    server_sock.bind((host, port))
    server_sock.listen(1)
    print(f"🌐 Socket服务器正在监听 {host}:{port}，等待客户端连接...")
    logging.info(f"Socket指令监听服务启动：{host}:{port}，等待远程控制指令...")

    events["start_recording"] = False
    client_sock = None  # 手动管理套接字生命周期

    try:
        while not events["stop_recording"]:
            try:
                # 接受客户端连接
                client_sock, addr = server_sock.accept()
                print(f"✅ 客户端已连接: {addr}")
                logging.info(f"客户端已连接：{addr}")

                # 线程安全：保存客户端套接字到共享容器
                with socket_lock:
                    client_socket_container[0] = client_sock

                # 长连接循环接收指令（移除with上下文，避免自动关闭）
                while not events["stop_recording"]:
                    try:
                        client_sock.settimeout(1.0)
                        data = client_sock.recv(1024).decode("utf-8").strip().lower()
                        if not data:
                            print(f"⚠️ 客户端 {addr} 主动断开连接")
                            logging.info(f"客户端{addr}主动断开连接")
                            break

                        print(f"📩 收到指令: {data} (来自 {addr})")
                        logging.info(f"收到远程指令：{data}，来自{addr}")
                        resp_msg = ""
                        if data == "start":
                            events["start_recording"] = True
                            resp_msg = "指令执行成功：开始录制"
                            print("▶️ 触发事件: 开始录制")
                            logging.info("触发事件：开始录制流程")
                        elif data == "stop":
                            events["stop_recording"] = True
                            resp_msg = "指令执行成功：停止全部录制"
                            print("⏹️ 触发事件: 停止全部录制")
                            logging.info("触发事件：停止全部录制")
                        elif data == "rerecord":
                            events["rerecord_episode"] = True
                            resp_msg = "指令执行成功：重录当前episode"
                            print("🔄 触发事件: 重录当前episode")
                            logging.info("触发事件：重录当前episode")
                        elif data == "exit_early":
                            events["exit_early"] = True
                            resp_msg = "指令执行成功：提前退出当前循环"
                            print("⏭️ 触发事件: 提前退出当前循环")
                            logging.info("触发事件：提前退出当前循环")
                        elif data == "reset_done":
                            events["reset_done"] = True
                            resp_msg = "指令执行成功：回正完成"
                            print("✅ 触发事件: 回正完成")
                            logging.info("触发事件：回正完成")
                        else:
                            resp_msg = f"未知指令：{data}"
                            print(f"❌ 未知指令: {data}")
                            logging.warning(resp_msg)
                        
                        # 响应客户端指令
                        client_sock.sendall(f"{resp_msg}\n".encode("utf-8"))
                    except socket.timeout:
                        # 无数据，继续循环
                        continue
                    except Exception as e:
                        logging.error(f"客户端通信异常：{str(e)}")
                        break

            except socket.timeout:
                # 无新连接，继续监听
                continue
            except Exception as e:
                logging.error(f"Socket监听异常：{str(e)}")
                break
    finally:
        # 手动关闭客户端套接字
        with socket_lock:
            if client_socket_container[0] is not None:
                try:
                    client_socket_container[0].close()
                except:
                    pass
                client_socket_container[0] = None
        # 关闭服务端套接字
        server_sock.close()
        logging.info("Socket指令监听服务已关闭")


def main():
    register_third_party_plugins()
    record()


if __name__ == "__main__":
    main()