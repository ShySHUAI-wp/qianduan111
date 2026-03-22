# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **LeRobot** project (Hugging Face robotics library) with a custom **Fronter** web application built on top of it.

- **LeRobot**: Python library for real-world robotics in PyTorch - provides models, datasets, and tools for robot control
- **Fronter**: Web-based robot control platform that provides a UI for LeRobot operations (port finding, calibration, teleoperation, data recording)

## Common Commands

### LeRobot CLI Commands

```bash
# Display LeRobot info
lerobot-info

# Find serial ports
lerobot-find-port

# Calibrate, teleoperate, or record
lerobot-calibrate
lerobot-teleoperate
lerobot-record

# Train a policy
lerobot-train --policy=act --dataset.repo_id=lerobot/aloha_mobile_cabinet

# Evaluate a policy
lerobot-eval --policy.path=lerobot/pi0_libero_finetuned --env.type=libero
```

### Docker

```bash
# Build user container
make build-user

# Build internal container
make build-internal
```

### Testing (Makefile)

```bash
# End-to-end tests
make test-end-to-end DEVICE=cpu

# Specific policy tests
make test-act-ete-train DEVICE=cpu
make test-act-ete-eval DEVICE=cpu
make test-diffusion-ete-train DEVICE=cpu
make test-tdmpc-ete-train DEVICE=cpu
make test-smolvla-ete-train DEVICE=cpu
```

### Fronter Application

The Fronter app is in the `fronter/` directory with:
- `fronter-backend/app/`: FastAPI + Socket.IO server (port 8000)
- `fronter-web/`: React + TypeScript frontend (Vite, port 5173)

```bash
# Frontend development
cd fronter/fronter-web
pnpm install
pnpm dev
pnpm build        # Build for production
pnpm lint         # ESLint
pnpm format       # Prettier

# Backend development
cd fronter/fronter-backend
python -m uvicorn app.main:socket_app --reload --host 0.0.0.0 --port 8000
```

## Architecture

### LeRobot (src/lerobot/)

- **policies/**: Robot learning policies (ACT, Diffusion, Pi0, Pi0.5, GR00T, SmolVLA, TDMPC, etc.)
- **datasets/**: LeRobotDataset format (Parquet + MP4) for robotic datasets
- **envs/**: Simulation environments (Libero, MetaWorld, etc.)
- **robots/**: Hardware abstractions for different robot types
- **motors/**: Motor control drivers (Dynamixel, Feetech)
- **cameras/**: Camera integrations (OpenCV, Realsense, etc.)

### Fronter (fronter/)

A web-based UI built on LeRobot:

- **Frontend** (fronter-web/): React + TypeScript + Ant Design + Zustand + Vite + React Router
- **Backend** (fronter-backend/app/): FastAPI + Python SocketIO for real-time communication
- **Features**: Port finding, camera management, robot calibration, teleoperation, data recording

### Key Integration Points

- Fronter uses `subprocess` to invoke LeRobot CLI commands via `ProcessManager`
- WebSocket (Socket.IO) for real-time command output streaming
- **Important**: The backend's `config.py` has `LEROBOT_PATH` which must point to the LeRobot source directory for command execution to work
- LeRobot's visualization pages can be embedded via iframe

### Calibration Directory

Robot and teleoperator calibration files are stored in:
- `calibration/robots/`: Robot configuration files (e.g., `so100_follower/`, `so101_follower/`)
- `calibration/teleoperators/`: Teleoperator configuration files (e.g., `so100_leader/`, `so101_leader/`)

## Development Notes

- Python 3.10+ required
- Node.js 18+ for Fronter frontend
- Uses `pnpm` as package manager for frontend
- **Fronter Backend Config**: Edit `fronter-backend/app/config.py` to set `LEROBOT_PATH` to your LeRobot installation directory
- Serial port access required (`/dev/ttyACM*` on Linux, COM ports on Windows)
- Camera access required (`/dev/video*` on Linux)
- **Pre-commit hooks**: Run `pre-commit install` after cloning to enable ruff, mypy, bandit, and gitleaks checks
