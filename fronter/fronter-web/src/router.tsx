import { Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './components/Layout/MainLayout';
import Home from './pages/Home';
import Tutorial from './pages/Tutorial';
import ChassisControl from './pages/ChassisControl';
import RobotControl from './pages/RobotControl';
import CalibrationPage from './pages/CalibrationPage';

function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<MainLayout />}>
        <Route index element={<Navigate to="/home" replace />} />
        <Route path="home" element={<Home />} />
        <Route path="calibration" element={<CalibrationPage />} />
        <Route path="tutorial/*" element={<Tutorial />} />
        <Route path="chassis-control" element={<ChassisControl />} />
        <Route path="robot-control/*" element={<RobotControl />} />
      </Route>
    </Routes>
  );
}

export default AppRouter;
