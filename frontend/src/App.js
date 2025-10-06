import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import './App.css';
import MapView from './components/MapView';
import MapViewReal from './components/MapViewReal';
import ShipInfo from './components/ShipInfo';
import SensorInfo from './components/SensorInfo';
import RoutePlanner from './components/RoutePlanner';
import TimeController from './components/TimeController';
import SimulationControl from './components/SimulationControl';
import ChatBot from './components/ChatBot';
import CCTVVideo from './components/CCTVVideo';
import LiDARStats from './components/LiDARStats';
import Emergency from './components/Emergency';
import Messages from './components/Messages';
import ReportGenerator from './components/ReportGenerator';
import obstaclesData from './data/obstacles_latlng.json';
import axios from 'axios';

// Environment-based configuration
const API_BASE = process.env.NODE_ENV === 'production'
  ? ''  // Empty because endpoints already include /api
  : 'http://localhost:8000';

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
  const [showRealtimeShips, setShowRealtimeShips] = useState(true); // Always show realtime ships
  const [showRoutes, setShowRoutes] = useState(false); // Only show routes for selected ship
  const [useRealMap, setUseRealMap] = useState(true); // Always use real map
  const [shipMapClickHandler, setShipMapClickHandler] = useState(null);
  // Dark mode removed
  const [sosAlerts, setSOSAlerts] = useState([]); // SOS alerts
  const [messages, setMessages] = useState([]); // Chat messages
  const [unreadCount, setUnreadCount] = useState(0); // Unread message count
  const [selectedChatShip, setSelectedChatShip] = useState('all'); // Selected ship for chat
  const [messageInput, setMessageInput] = useState(''); // Chat input
  const [isLiveMode, setIsLiveMode] = useState(false); // Live/Demo mode toggle
  const [selectedCCTV, setSelectedCCTV] = useState(null); // Selected CCTV for video display
  const [selectedCCTVMarker, setSelectedCCTVMarker] = useState(null); // Selected CCTV to show on map
  const [selectedLiDAR, setSelectedLiDAR] = useState(null); // Selected LiDAR for statistics display
  const [showCCTVMarkers, setShowCCTVMarkers] = useState(false); // Show CCTV markers on map
  const [showLiDARMarkers, setShowLiDARMarkers] = useState(false); // Show LiDAR markers on map
  const [showDensityHeatmap, setShowDensityHeatmap] = useState(false); // Show ship density heatmap
  const [showObstacles, setShowObstacles] = useState(false); // Show obstacles on map
  const [showEntryExitStats, setShowEntryExitStats] = useState(false); // Show entry/exit statistics window
  const [isSimulationRunning, setIsSimulationRunning] = useState(false); // Simulation running state
  const [simulationTime, setSimulationTime] = useState(null); // Current simulation time
  const [selectedShipRoute, setSelectedShipRoute] = useState(null); // Selected ship's route from simulation
  const [expandedPanel, setExpandedPanel] = useState(null); // Track which accordion panel is expanded
  const [singlePanelMode, setSinglePanelMode] = useState(false); // Track if showing single panel

  // Always show realtime ships regardless of mode
  useEffect(() => {
    setShowRealtimeShips(true);  // Always show realtime ships
  }, []);

  // Fetch initial data and refresh when Live/Demo mode changes
  useEffect(() => {
    fetchShips();
    fetchSensorData();
    fetchRoutes();
    fetchSOSAlerts();
    fetchMessages();
    fetchUnreadCount();
  }, [isLiveMode]);  // Refetch when mode changes

  // Dark mode removed - this effect is no longer needed

  // Always fetch realtime data
  useEffect(() => {
    fetchRealtimeData(); // Fetch immediately
    const interval = setInterval(fetchRealtimeData, isSimulationRunning ? 1000 : 5000); // Faster updates during simulation
    return () => clearInterval(interval);
  }, [isLiveMode, isSimulationRunning]);  // Re-run when mode or simulation changes

  // Fetch simulation routes when needed
  // Removed fetch simulation routes effect - not needed

  // Listen for map marker click events to sync selection
  useEffect(() => {
    const handler = (e) => {
      const { shipId, devId, id } = e.detail || {};
      // Prefer matching by numeric id when available
      if (typeof id === 'number') {
        const match = ships.find(s => s.id === id);
        if (match) {
          setSelectedShip(match);
          fetchShipRoute(match.shipId || match.ship_id || match.id);
          return;
        }
      }
      if (typeof devId === 'number') {
        const match = ships.find(s => s.id === devId);
        if (match) {
          setSelectedShip(match);
          fetchShipRoute(match.shipId || match.ship_id || match.id);
          return;
        }
      }
      if (shipId) {
        const match = ships.find(s => String(s.shipId) === String(shipId));
        if (match) {
          setSelectedShip(match);
          fetchShipRoute(match.shipId || match.ship_id || match.id);
        }
      }
    };
    window.addEventListener('map-ship-marker-click', handler);
    return () => window.removeEventListener('map-ship-marker-click', handler);
  }, [ships]);

  // Removed fetch route effect - not needed for simulation

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
      const endpoint = isLiveMode
        ? `${API_BASE}/api/eum/ships/live`  // Live API endpoint
        : `${API_BASE}/api/eum/ships`;      // Demo (existing DB) endpoint

      const response = await axios.get(endpoint);
      console.log(`Fetched ships (${isLiveMode ? 'LIVE' : 'DEMO'}):`, response.data);
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
      // If simulation is running, fetch from simulation endpoint
      if (isSimulationRunning) {
        const response = await axios.get(`${API_BASE}/api/simulation/ship-positions`);
        console.log('✅ Fetched simulation data:', response.data.length, 'ships');
        // Debug: Show Ship 2 position
        const ship2 = response.data.find(s => s.devId === 2);
        if (ship2) {
          console.log('  Ship 2:', ship2.lati.toFixed(6), ship2.longi.toFixed(6), 'speed:', ship2.speed);
        }
        setRealtimeData(response.data);
        return;
      }

      // Otherwise use normal endpoints
      const endpoint = isLiveMode
        ? `${API_BASE}/api/eum/ships/realtime/live`  // Live API endpoint
        : `${API_BASE}/api/eum/ships/realtime/demo`; // Demo endpoint aligned with DB ship IDs

      const response = await axios.get(endpoint);
      console.log(`Fetched realtime data (${isLiveMode ? 'LIVE' : 'DEMO'}):`, response.data.length, 'ships');
      setRealtimeData(response.data);
    } catch (error) {
      console.error('Failed to fetch realtime data:', error);
    }
  };

  // Clicking a marker on the map selects the corresponding ship in the left dropdown
  const handleShipMarkerClick = (markerId) => {
    // markerId is devId (number) in demo/live endpoints; match against DB ship id
    const byId = ships.find(s => s.id === markerId);
    if (byId) {
      setSelectedShip(byId);
      return;
    }
    // Fallback: try matching string-based shipId
    const markerIdStr = String(markerId);
    const byShipId = ships.find(s => String(s.shipId) === markerIdStr);
    if (byShipId) {
      setSelectedShip(byShipId);
    }
  };

  // Removed fetchSimulationRoutes function - not needed

  const handleSimulationStatusChange = (status) => {
    setIsSimulationRunning(status.is_running);
    setSimulationTime(status.simulation_time);
  };

  // Fetch selected ship's route from simulation
  const fetchShipRoute = async (shipId) => {
    try {
      // Try to get route from simulation database
      const response = await axios.get(`${API_BASE}/api/simulation/ship-route/${shipId}`);
      if (response.data && response.data.path) {
        console.log('Fetched ship route:', response.data);
        setSelectedShipRoute(response.data);
      } else {
        setSelectedShipRoute(null);
      }
    } catch (error) {
      console.error('Failed to fetch ship route:', error);
      setSelectedShipRoute(null);
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

  // Handle sensor selection from SensorInfo component
  const handleSensorSelect = (type, data) => {
    if (type === 'cctv-single') {
      // Show single CCTV marker and select it for video
      setShowCCTVMarkers(true);
      setShowLiDARMarkers(false);
      setSelectedCCTV(data);
      setSelectedLiDAR(null);
      setShowEntryExitStats(false);
    } else if (type === 'lidar-single') {
      // Show single LiDAR marker and automatically show stats
      setShowLiDARMarkers(true);
      setShowCCTVMarkers(false);
      setSelectedLiDAR(data);
      setSelectedCCTV(null);
      setShowEntryExitStats(true);  // Automatically show stats when LiDAR is selected
    } else if (type === 'clear') {
      // Clear all sensor markers and hide stats
      setShowCCTVMarkers(false);
      setShowLiDARMarkers(false);
      setSelectedCCTV(null);
      setSelectedLiDAR(null);
      setShowEntryExitStats(false);
    }
  };

  const handleShipMapClickMode = (handler) => {
    setShipMapClickHandler(() => handler);
  };

  // Handle LiDAR selection for stats display
  const handleLiDARSelect = (lidar) => {
    console.log('LiDAR selected:', lidar);
    setSelectedLiDAR(lidar);
  };

  return (
    <div className="App">
      {/* Floating Header */}
      <div className="floating-header">
        <div className="floating-header-title">소규모 항구 통합 관제 시스템</div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            className={`floating-header-button ${showDensityHeatmap ? 'active' : ''}`}
            onClick={() => {
              console.log('Density button clicked. Current state:', showDensityHeatmap, '-> New state:', !showDensityHeatmap);
              setShowDensityHeatmap(!showDensityHeatmap);
            }}
            style={{
              backgroundColor: showDensityHeatmap ? 'rgba(102, 126, 234, 0.9)' : '',  // Using purple like sidebar buttons
              color: showDensityHeatmap ? 'white' : '',
              boxShadow: showDensityHeatmap ? '0 0 10px rgba(102, 126, 234, 0.5)' : ''
            }}
          >
            밀집도
          </button>

          <button
            className={`floating-header-button ${showObstacles ? 'active' : ''}`}
            onClick={() => {
              console.log('Obstacles button clicked. Current state:', showObstacles, '-> New state:', !showObstacles);
              setShowObstacles(!showObstacles);
            }}
            style={{
              backgroundColor: showObstacles ? 'rgba(102, 126, 234, 0.9)' : '',  // Using purple like sidebar buttons
              color: showObstacles ? 'white' : '',
              boxShadow: showObstacles ? '0 0 10px rgba(102, 126, 234, 0.5)' : ''
            }}
          >
            장애물
          </button>

          <Link to="/chatbot" className="floating-header-button">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
            </svg>
            AI 챗봇
          </Link>
        </div>
      </div>

      <div className="main-container">
        <div className="accordion-panel">
          {/* Accordion Panel 1: Ship Info */}
          <div className="accordion-item">
            <div
              className={`accordion-header ${expandedPanel === 'shipInfo' ? 'active' : ''} ${singlePanelMode && expandedPanel !== 'shipInfo' ? 'hidden' : ''}`}
              onClick={() => {
                if (expandedPanel === 'shipInfo') {
                  setExpandedPanel(null);
                  setSinglePanelMode(false);
                } else {
                  setExpandedPanel('shipInfo');
                  setSinglePanelMode(true);
                }
              }}
            >
              <span className="accordion-title">선박 정보</span>
              <span className="accordion-arrow">{expandedPanel === 'shipInfo' ? '▼' : '▶'}</span>
            </div>
            {expandedPanel === 'shipInfo' && (
              <div className={`accordion-content ${singlePanelMode ? 'full-height' : ''}`}>
                <ShipInfo
                  ships={ships}
                  selectedShip={selectedShip}
                  onSelectShip={(ship) => {
                    setSelectedShip(ship);
                    if (ship) {
                      fetchShipRoute(ship.shipId || ship.ship_id || ship.id);
                    } else {
                      setSelectedShipRoute(null);
                    }
                  }}
                  onUpdatePositions={handleUpdatePositions}
                  onMapClick={handleShipMapClickMode}
                />
              </div>
            )}
          </div>

          {/* Accordion Panel 2: Sensor Info */}
          <div className="accordion-item">
            <div
              className={`accordion-header ${expandedPanel === 'sensorInfo' ? 'active' : ''} ${singlePanelMode && expandedPanel !== 'sensorInfo' ? 'hidden' : ''}`}
              onClick={() => {
                if (expandedPanel === 'sensorInfo') {
                  setExpandedPanel(null);
                  setSinglePanelMode(false);
                } else {
                  setExpandedPanel('sensorInfo');
                  setSinglePanelMode(true);
                }
              }}
            >
              <span className="accordion-title">종합 정보</span>
              <span className="accordion-arrow">{expandedPanel === 'sensorInfo' ? '▼' : '▶'}</span>
            </div>
            {expandedPanel === 'sensorInfo' && (
              <div className={`accordion-content ${singlePanelMode ? 'full-height' : ''}`}>
                <SensorInfo
                  sensorData={sensorData}
                  onSensorSelect={handleSensorSelect}
                />
              </div>
            )}
          </div>

          {/* Accordion Panel 3: Route Planner */}
          <div className="accordion-item">
            <div
              className={`accordion-header ${expandedPanel === 'routePlanner' ? 'active' : ''} ${singlePanelMode && expandedPanel !== 'routePlanner' ? 'hidden' : ''}`}
              onClick={() => {
                if (expandedPanel === 'routePlanner') {
                  setExpandedPanel(null);
                  setSinglePanelMode(false);
                } else {
                  setExpandedPanel('routePlanner');
                  setSinglePanelMode(true);
                }
              }}
            >
              <span className="accordion-title">출항 스케줄</span>
              <span className="accordion-arrow">{expandedPanel === 'routePlanner' ? '▼' : '▶'}</span>
            </div>
            {expandedPanel === 'routePlanner' && (
              <div className={`accordion-content ${singlePanelMode ? 'full-height' : ''}`}>
                <RoutePlanner
                  ships={ships}
                  selectedShip={selectedShip}
                  onSelectShip={(ship) => {
                    setSelectedShip(ship);
                    if (ship) {
                      fetchShipRoute(ship.shipId || ship.ship_id || ship.id);
                    } else {
                      setSelectedShipRoute(null);
                    }
                  }}
                  onShipRouteClick={(shipId) => {
                    fetchShipRoute(shipId);
                  }}
                />
              </div>
            )}
          </div>

          {/* Accordion Panel 4: Simulation Control */}
          <div className="accordion-item">
            <div
              className={`accordion-header ${expandedPanel === 'simulation' ? 'active' : ''} ${singlePanelMode && expandedPanel !== 'simulation' ? 'hidden' : ''}`}
              onClick={() => {
                if (expandedPanel === 'simulation') {
                  setExpandedPanel(null);
                  setSinglePanelMode(false);
                } else {
                  setExpandedPanel('simulation');
                  setSinglePanelMode(true);
                }
              }}
            >
              <span className="accordion-title">시뮬레이션 제어</span>
              <span className="accordion-arrow">{expandedPanel === 'simulation' ? '▼' : '▶'}</span>
            </div>
            {expandedPanel === 'simulation' && (
              <div className={`accordion-content ${singlePanelMode ? 'full-height' : ''}`}>
                <SimulationControl
                  onSimulationStatusChange={handleSimulationStatusChange}
                />
              </div>
            )}
          </div>

          {/* Accordion Panel 5: Emergency */}
          <div className="accordion-item">
            <div
              className={`accordion-header ${expandedPanel === 'emergency' ? 'active' : ''} ${singlePanelMode && expandedPanel !== 'emergency' ? 'hidden' : ''}`}
              onClick={() => {
                if (expandedPanel === 'emergency') {
                  setExpandedPanel(null);
                  setSinglePanelMode(false);
                } else {
                  setExpandedPanel('emergency');
                  setSinglePanelMode(true);
                }
              }}
            >
              <span className="accordion-title">긴급 상황</span>
              {sosAlerts.filter(alert => alert.status === 'active').length > 0 && (
                <span className="sos-badge">
                  {sosAlerts.filter(alert => alert.status === 'active').length}
                </span>
              )}
              <span className="accordion-arrow">{expandedPanel === 'emergency' ? '▼' : '▶'}</span>
            </div>
            {expandedPanel === 'emergency' && (
              <div className={`accordion-content ${singlePanelMode ? 'full-height' : ''}`}>
                <Emergency
                  sosAlerts={sosAlerts}
                  onSOSUpdate={handleSOSUpdate}
                />
              </div>
            )}
          </div>

          {/* Accordion Panel 6: Messages */}
          <div className="accordion-item">
            <div
              className={`accordion-header ${expandedPanel === 'messages' ? 'active' : ''} ${singlePanelMode && expandedPanel !== 'messages' ? 'hidden' : ''}`}
              onClick={() => {
                if (expandedPanel === 'messages') {
                  setExpandedPanel(null);
                  setSinglePanelMode(false);
                } else {
                  setExpandedPanel('messages');
                  setSinglePanelMode(true);
                }
              }}
            >
              <span className="accordion-title">메시지</span>
              {unreadCount > 0 && (
                <span className="unread-badge">{unreadCount}</span>
              )}
              <span className="accordion-arrow">{expandedPanel === 'messages' ? '▼' : '▶'}</span>
            </div>
            {expandedPanel === 'messages' && (
              <div className={`accordion-content ${singlePanelMode ? 'full-height' : ''}`}>
                <Messages
                  messages={messages}
                  unreadCount={unreadCount}
                  selectedChatShip={selectedChatShip}
                  setSelectedChatShip={setSelectedChatShip}
                  messageInput={messageInput}
                  setMessageInput={setMessageInput}
                  sendMessage={sendMessage}
                  markMessagesAsRead={markMessagesAsRead}
                  ships={ships}
                />
              </div>
            )}
          </div>

          {/* Accordion Panel 7: Report Generation */}
          <div className="accordion-item">
            <div
              className={`accordion-header ${expandedPanel === 'report' ? 'active' : ''} ${singlePanelMode && expandedPanel !== 'report' ? 'hidden' : ''}`}
              onClick={() => {
                if (expandedPanel === 'report') {
                  setExpandedPanel(null);
                  setSinglePanelMode(false);
                } else {
                  setExpandedPanel('report');
                  setSinglePanelMode(true);
                }
              }}
            >
              <span className="accordion-title">보고서 생성</span>
              <span className="accordion-arrow">{expandedPanel === 'report' ? '▼' : '▶'}</span>
            </div>
            {expandedPanel === 'report' && (
              <div className={`accordion-content ${singlePanelMode ? 'full-height' : ''}`}>
                <ReportGenerator
                  ships={ships}
                  sosAlerts={sosAlerts}
                  messages={messages}
                  simulationRoutes={selectedShipRoute ? [selectedShipRoute] : []}
                />
              </div>
            )}
          </div>
        </div>

        <div className="map-container">
          <MapViewReal
            ships={realtimeData}  // Always show realtime data
            routes={selectedShipRoute ? [selectedShipRoute] : []}  // Show route for selected ship if available
            selectedShip={selectedShip}
            obstacles={obstaclesData} // Pass obstacle data
            onSetStart={() => setMapClickMode('start')}
            onSetGoal={() => setMapClickMode('goal')}
            routePoints={routePoints}
            plannedRoute={plannedRoute}
            onMapClick={shipMapClickHandler}
            sosAlerts={sosAlerts}  // Pass SOS alerts
            selectedCCTVMarker={selectedCCTVMarker}  // Pass selected CCTV to show marker
            selectedCCTV={selectedCCTV}  // Pass currently selected CCTV for filtering
            onCCTVSelect={setSelectedCCTV}  // Handle CCTV video selection
            cctvData={sensorData.cctv}  // Pass CCTV data
            showCCTVMarkers={showCCTVMarkers}  // Control CCTV marker visibility
            lidarData={sensorData.lidar}  // Pass LiDAR data
            showLiDARMarkers={showLiDARMarkers}  // Control LiDAR marker visibility
            onLiDARSelect={handleLiDARSelect}  // Handle LiDAR selection
            onShipSelect={(ids) => {
              // Directly select ship to force re-render/highlight immediately
              const match = ships.find(s => s.id === ids.id) || ships.find(s => String(s.shipId) === String(ids.shipId));
              if (match) setSelectedShip(match);
            }}
            isSimulationRunning={isSimulationRunning}
            showDensityHeatmap={showDensityHeatmap}  // Control density heatmap visibility
            showObstacles={showObstacles}  // Control obstacles visibility
          />

          {/* CCTV Video Display */}
          {selectedCCTV && (
            <CCTVVideo
              cctvId={selectedCCTV.id}
              cctvName={selectedCCTV.name}
              onClose={() => {
                setSelectedCCTV(null);
                setShowCCTVMarkers(false);
              }}
            />
          )}

          {/* LiDAR Statistics Display */}
          {selectedLiDAR && showEntryExitStats && (
            <LiDARStats
              lidar={selectedLiDAR}
              onClose={() => {
                setSelectedLiDAR(null);
                setShowEntryExitStats(false);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function App() {
  const basename = process.env.NODE_ENV === 'production' ? '/ship-navigator' : '/';

  return (
    <Router basename={basename}>
      <Routes>
        <Route path="/" element={<MainDashboard />} />
        <Route path="/chatbot" element={<ChatBot />} />
      </Routes>
    </Router>
  );
}

export default App;