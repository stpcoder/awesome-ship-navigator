import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import './App.css';
import MapView from './components/MapView';
import MapViewReal from './components/MapViewReal';
import ShipInfo from './components/ShipInfo';
import SensorInfo from './components/SensorInfo';
import RoutePlanner from './components/RoutePlanner';
import TimeController from './components/TimeController';
import ChatBot from './components/ChatBot';
import obstaclesData from './data/obstacles_latlng.json';
import axios from 'axios';

const API_BASE = 'http://localhost:8000';

function MainDashboard() {
  const [ships, setShips] = useState([]);
  const [selectedShip, setSelectedShip] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [realtimeData, setRealtimeData] = useState([]);
  const [sensorData, setSensorData] = useState({ cctv: [], lidar: [] });
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [plannedRoute, setPlannedRoute] = useState(null);
  const [mapClickMode, setMapClickMode] = useState(null); // 'start' or 'goal'
  const [routePoints, setRoutePoints] = useState({ start: null, goal: null });
  const [showRealtimeShips, setShowRealtimeShips] = useState(false);
  const [showRoutes, setShowRoutes] = useState(true);
  const [useRealMap, setUseRealMap] = useState(true); // Toggle for real map
  const [shipMapClickHandler, setShipMapClickHandler] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(false); // Dark mode state
  const [sosAlerts, setSOSAlerts] = useState([]); // SOS alerts
  const [messages, setMessages] = useState([]); // Chat messages
  const [unreadCount, setUnreadCount] = useState(0); // Unread message count
  const [selectedChatShip, setSelectedChatShip] = useState('all'); // Selected ship for chat
  const [messageInput, setMessageInput] = useState(''); // Chat input

  // Fetch initial data
  useEffect(() => {
    fetchShips();
    fetchSensorData();
    fetchRoutes();
    fetchSOSAlerts();
    fetchMessages();
    fetchUnreadCount();
  }, []);

  // Toggle dark mode
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }, [isDarkMode]);

  // Fetch realtime data only when toggle is on
  useEffect(() => {
    let interval;
    if (showRealtimeShips) {
      fetchRealtimeData(); // Fetch immediately
      interval = setInterval(fetchRealtimeData, 5000); // Update every 5 seconds
    } else {
      // Clear realtime data when toggle is off
      setRealtimeData([]);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [showRealtimeShips]);

  // Fetch SOS alerts periodically
  useEffect(() => {
    const interval = setInterval(fetchSOSAlerts, 10000); // Update every 10 seconds
    return () => clearInterval(interval);
  }, []);

  // Fetch messages periodically
  useEffect(() => {
    const interval = setInterval(() => {
      fetchMessages();
      fetchUnreadCount();
    }, 5000); // Update every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchShips = async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/eum/ships`);
      console.log('Fetched ships:', response.data);
      setShips(response.data);
    } catch (error) {
      console.error('Failed to fetch ships:', error);
    }
  };

  const fetchSensorData = async () => {
    try {
      const [cctvRes, lidarRes] = await Promise.all([
        axios.get(`${API_BASE}/api/eum/cctv`),
        axios.get(`${API_BASE}/api/eum/lidar`)
      ]);
      setSensorData({
        cctv: cctvRes.data,
        lidar: lidarRes.data
      });
    } catch (error) {
      console.error('Failed to fetch sensor data:', error);
      // Set empty sensor data on error
      setSensorData({ cctv: [], lidar: [] });
    }
  };

  const fetchRoutes = async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/ships`);
      setRoutes(response.data);
    } catch (error) {
      console.error('Failed to fetch routes:', error);
    }
  };

  const fetchRealtimeData = async () => {
    try {
      // Fetch only EUM real-time data, not our planned routes
      const response = await axios.get(`${API_BASE}/api/eum/ships/realtime`);
      setRealtimeData(response.data);
    } catch (error) {
      console.error('Failed to fetch realtime data:', error);
    }
  };

  const fetchSOSAlerts = async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/sos/active`);
      setSOSAlerts(response.data);
    } catch (error) {
      console.error('Failed to fetch SOS alerts:', error);
    }
  };

  const handleSOSUpdate = async (alertId, status) => {
    try {
      await axios.patch(`${API_BASE}/api/sos/${alertId}`, { status });
      fetchSOSAlerts(); // Refresh the list
    } catch (error) {
      console.error('Failed to update SOS alert:', error);
    }
  };

  const fetchMessages = async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/messages`);
      setMessages(response.data);
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    }
  };

  const fetchUnreadCount = async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/messages/unread-count`);
      setUnreadCount(response.data.unread_count);
    } catch (error) {
      console.error('Failed to fetch unread count:', error);
    }
  };

  const sendMessage = async () => {
    if (!messageInput.trim()) return;

    try {
      await axios.post(`${API_BASE}/api/messages`, {
        sender_id: 'control_center',
        recipient_id: selectedChatShip,
        message: messageInput,
        message_type: selectedChatShip === 'all' ? 'broadcast' : 'text'
      });

      setMessageInput('');
      fetchMessages(); // Refresh messages
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const markMessagesAsRead = async (messageIds) => {
    try {
      await axios.patch(`${API_BASE}/api/messages/mark-read`, {
        message_ids: messageIds
      });
      fetchMessages();
      fetchUnreadCount();
    } catch (error) {
      console.error('Failed to mark messages as read:', error);
    }
  };

  const handlePlanRoute = async (shipId, departureTime, acceptRecommendation, startPos, goalPos) => {
    // Use provided positions from RoutePlanner instead of map click points
    const start = startPos || routePoints.start;
    const goal = goalPos || routePoints.goal;

    if (!start || !goal) {
      alert('출발점과 도착점이 설정되지 않았습니다.');
      return;
    }

    try {
      // Clear previous planned route
      setPlannedRoute(null);

      // Plan route using the single endpoint
      const planResponse = await axios.post(`${API_BASE}/api/route/plan`, {
        ship_id: shipId,
        start_position: start,
        goal_position: goal,
        departure_time: departureTime,
        speed_knots: 12.0
      });

      setPlannedRoute(planResponse.data);

      // The route is already stored in the database by the backend
      // Just refresh the routes list
      fetchRoutes();

      const modeText = acceptRecommendation ? '수용 O (Flexible)' : '수용 X (Fixed)';
      const message = acceptRecommendation
        ? `경로 계획 완료!\n모드: ${modeText}\n추천 출발 시간: ${planResponse.data.recommended_departure?.toFixed(1)}분 후`
        : `경로 계획 완료!\n모드: ${modeText}\n고정 출발 시간: ${departureTime}분 후`;

      alert(message);

      // Clear route points for next planning
      setRoutePoints({ start: null, goal: null });
    } catch (error) {
      console.error('Failed to plan route:', error);
      alert('경로 계획 실패: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handleMapClick = (position) => {
    if (mapClickMode === 'start') {
      setRoutePoints({ ...routePoints, start: position });
      setMapClickMode(null);
    } else if (mapClickMode === 'goal') {
      setRoutePoints({ ...routePoints, goal: position });
      setMapClickMode(null);
    }
  };

  const handleUpdatePositions = (shipId, positions) => {
    // Update the ship positions in the ships array
    setShips(prevShips => prevShips.map(ship =>
      ship.shipId === shipId
        ? { ...ship, ...positions }
        : ship
    ));

    // Update selected ship if it's the one being updated
    if (selectedShip?.shipId === shipId) {
      setSelectedShip(prev => ({ ...prev, ...positions }));
    }
  };

  const handleShipMapClickMode = (handler) => {
    setShipMapClickHandler(() => handler);
  };

  const handleSensorSelect = (sensorType, sensorData) => {
    // This function will be called when a sensor is selected from the dropdown
    // You can add logic here to display the sensor on the map
    console.log('Sensor selected:', sensorType, sensorData);
    // TODO: Add marker to map at sensorData.lat, sensorData.lng
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>🚢 선박 항로 최적화 시스템</h1>
        <div
          className={`theme-toggle ${isDarkMode ? 'dark' : ''}`}
          onClick={() => setIsDarkMode(!isDarkMode)}
        >
          <div className="theme-toggle-slider">
            {isDarkMode ? '🌙' : '☀️'}
          </div>
        </div>
        <Link to="/chatbot" style={{
          position: 'absolute',
          right: '20px',
          padding: '8px 16px',
          background: 'white',
          color: '#333',
          borderRadius: '20px',
          textDecoration: 'none',
          fontWeight: '500'
        }}>
          💬 챗봇
        </Link>
      </header>

      <div className="main-container">
        <div className="left-panel">
          <ShipInfo
            ships={ships}
            selectedShip={selectedShip}
            onSelectShip={setSelectedShip}
            onUpdatePositions={handleUpdatePositions}
            onMapClick={handleShipMapClickMode}
          />

          <SensorInfo
            sensorData={sensorData}
            onSensorSelect={handleSensorSelect}
          />
        </div>

        <div className="center-panel">
          {useRealMap ? (
            <MapViewReal
              ships={showRealtimeShips ? realtimeData : []}
              routes={showRoutes ? routes : []}
              selectedShip={selectedShip}
              obstacles={obstaclesData} // Pass obstacle data
              onSetStart={() => setMapClickMode('start')}
              onSetGoal={() => setMapClickMode('goal')}
              routePoints={routePoints}
              plannedRoute={plannedRoute}
              onMapClick={shipMapClickHandler}
              sosAlerts={sosAlerts}  // Pass SOS alerts
            />
          ) : (
            <MapView
              routes={routes}
              realtimeData={realtimeData}
              sensorData={sensorData}
              currentTime={currentTime}
              plannedRoute={plannedRoute}
              onMapClick={handleMapClick}
              mapClickMode={mapClickMode}
              routePoints={routePoints}
              showRealtimeShips={showRealtimeShips}
              showRoutes={showRoutes}
              selectedShip={selectedShip}
              ships={ships}
              sosAlerts={sosAlerts}  // Pass SOS alerts
            />
          )}

          <TimeController
            currentTime={currentTime}
            onTimeChange={setCurrentTime}
            isPlaying={isPlaying}
            onPlayPause={() => setIsPlaying(!isPlaying)}
          />

          <div className="toggle-controls" style={{
            display: 'flex',
            gap: '1rem',
            padding: '1rem',
            background: '#f5f5f5',
            borderRadius: '8px',
            marginTop: '1rem'
          }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              cursor: 'pointer'
            }}>
              <input
                type="checkbox"
                checked={showRealtimeShips}
                onChange={(e) => setShowRealtimeShips(e.target.checked)}
                style={{ width: '20px', height: '20px' }}
              />
              <span style={{ fontWeight: '500' }}>🚢 실시간 선박 위치 표시</span>
            </label>

            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              cursor: 'pointer'
            }}>
              <input
                type="checkbox"
                checked={useRealMap}
                onChange={(e) => setUseRealMap(e.target.checked)}
                style={{ width: '20px', height: '20px' }}
              />
              <span style={{ fontWeight: '500' }}>🗺️ 실제 지도 사용</span>
            </label>

            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              cursor: 'pointer'
            }}>
              <input
                type="checkbox"
                checked={showRoutes}
                onChange={(e) => setShowRoutes(e.target.checked)}
                style={{ width: '20px', height: '20px' }}
              />
              <span style={{ fontWeight: '500' }}>🗺️ 계획된 경로 표시</span>
            </label>
          </div>
        </div>

        <div className="right-panel">
          <RoutePlanner
            ships={ships}
            selectedShip={selectedShip}
            onPlanRoute={handlePlanRoute}
          />

          <div className="route-info">
            <h3>경로 정보</h3>
            {plannedRoute && (
              <div>
                <p>선박 ID: {plannedRoute.ship_id}</p>
                <p>출발 시간: {plannedRoute.recommended_departure?.toFixed(1)} 분</p>
                <p>도착 시간: {plannedRoute.arrival_time?.toFixed(1)} 분</p>
                <p>총 거리: {plannedRoute.total_distance_nm?.toFixed(2)} nm</p>
                <p>최적화 타입: {plannedRoute.optimization_type}</p>
                {plannedRoute.time_saved_minutes && (
                  <p>절약 시간: {plannedRoute.time_saved_minutes.toFixed(1)} 분</p>
                )}
              </div>
            )}
          </div>

          <div className="active-routes">
            <h3>활성 경로</h3>
            {routes.filter(r => r.status === 'accepted' || r.status === 'active').map(route => (
              <div key={route.ship_id} className="route-item">
                <p>{route.ship_id}</p>
                <p>모드: {route.optimization_mode}</p>
                <p>상태: {route.status}</p>
              </div>
            ))}
          </div>

          <div className="sos-alerts" style={{
            marginTop: '1rem',
            padding: '1rem',
            background: '#fff3cd',
            borderRadius: '8px',
            border: '1px solid #ffddaa'
          }}>
            <h3 style={{ color: '#d63031' }}>긴급 신호</h3>
            {sosAlerts.length === 0 ? (
              <p style={{ color: '#666' }}>현재 긴급 신호가 없습니다</p>
            ) : (
              sosAlerts.map(alert => (
                <div key={alert.id} className="sos-alert-item" style={{
                  marginBottom: '1rem',
                  padding: '0.8rem',
                  background: '#ffeeee',
                  borderRadius: '6px',
                  border: '1px solid #ff6b6b'
                }}>
                  <div style={{ fontWeight: 'bold', color: '#d63031', marginBottom: '0.5rem' }}>
                    {alert.ship_name || alert.ship_id}
                  </div>
                  <div style={{ fontSize: '0.9rem', marginBottom: '0.3rem' }}>
                    <strong>유형:</strong> {
                      alert.emergency_type === 'collision' ? '충돌 위험' :
                      alert.emergency_type === 'fire' ? '화재' :
                      alert.emergency_type === 'engine' ? '엔진 고장' :
                      alert.emergency_type === 'medical' ? '의료 응급' :
                      alert.emergency_type
                    }
                  </div>
                  <div style={{ fontSize: '0.9rem', marginBottom: '0.3rem' }}>
                    <strong>메시지:</strong> {alert.message}
                  </div>
                  <div style={{ fontSize: '0.9rem', marginBottom: '0.3rem' }}>
                    <strong>위치:</strong> {alert.latitude?.toFixed(4)}, {alert.longitude?.toFixed(4)}
                  </div>
                  <div style={{ fontSize: '0.9rem', marginBottom: '0.5rem', color: '#666' }}>
                    <strong>시각:</strong> {new Date(alert.created_at).toLocaleString('ko-KR')}
                  </div>
                  {alert.status === 'active' && (
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={() => handleSOSUpdate(alert.id, 'responding')}
                        style={{
                          padding: '0.3rem 0.8rem',
                          background: '#ffeaa7',
                          border: '1px solid #fdcb6e',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.85rem'
                        }}
                      >
                        대응 중
                      </button>
                      <button
                        onClick={() => handleSOSUpdate(alert.id, 'resolved')}
                        style={{
                          padding: '0.3rem 0.8rem',
                          background: '#55efc4',
                          border: '1px solid #00b894',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.85rem'
                        }}
                      >
                        해결됨
                      </button>
                    </div>
                  )}
                  {alert.status === 'responding' && (
                    <div style={{
                      display: 'inline-block',
                      padding: '0.2rem 0.6rem',
                      background: '#ffeaa7',
                      borderRadius: '4px',
                      fontSize: '0.85rem'
                    }}>
                      대응 중
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Chat Panel */}
          <div style={{
            marginTop: '1rem',
            padding: '1rem',
            background: '#f8f9fa',
            borderRadius: '8px',
            border: '1px solid #dee2e6'
          }}>
            <h3 style={{ marginBottom: '1rem' }}>채팅 메시지 {unreadCount > 0 && `(${unreadCount} 미읽음)`}</h3>

            {/* Ship selector */}
            <div style={{ marginBottom: '1rem' }}>
              <select
                value={selectedChatShip}
                onChange={(e) => setSelectedChatShip(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  borderRadius: '4px',
                  border: '1px solid #ced4da'
                }}
              >
                <option value="all">전체 선박</option>
                <option value="control_center">관제센터</option>
                {ships.map(ship => (
                  <option key={ship.shipId} value={ship.shipId}>
                    {ship.name || ship.shipId}
                  </option>
                ))}
              </select>
            </div>

            {/* Messages display */}
            <div style={{
              maxHeight: '300px',
              overflowY: 'auto',
              marginBottom: '1rem',
              padding: '0.5rem',
              background: 'white',
              borderRadius: '4px',
              border: '1px solid #dee2e6'
            }}>
              {messages.length === 0 ? (
                <p style={{ color: '#666', textAlign: 'center' }}>메시지가 없습니다</p>
              ) : (
                messages.map(msg => (
                  <div
                    key={msg.id}
                    style={{
                      marginBottom: '0.5rem',
                      padding: '0.5rem',
                      background: msg.sender_id === 'control_center' ? '#e3f2fd' : '#f5f5f5',
                      borderRadius: '4px',
                      border: `1px solid ${msg.is_read ? '#e0e0e0' : '#2196f3'}`,
                      fontWeight: msg.is_read ? 'normal' : 'bold'
                    }}
                    onClick={() => !msg.is_read && markMessagesAsRead([msg.id])}
                  >
                    <div style={{
                      fontSize: '0.85rem',
                      color: '#666',
                      marginBottom: '0.25rem'
                    }}>
                      {msg.sender_name} → {msg.recipient_name}
                      <span style={{ float: 'right' }}>
                        {new Date(msg.created_at).toLocaleString('ko-KR')}
                      </span>
                    </div>
                    <div>{msg.message}</div>
                  </div>
                ))
              )}
            </div>

            {/* Message input */}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="메시지를 입력하세요..."
                style={{
                  flex: 1,
                  padding: '0.5rem',
                  borderRadius: '4px',
                  border: '1px solid #ced4da'
                }}
              />
              <button
                onClick={sendMessage}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                전송
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<MainDashboard />} />
        <Route path="/chatbot" element={<ChatBot />} />
      </Routes>
    </Router>
  );
}

export default App;