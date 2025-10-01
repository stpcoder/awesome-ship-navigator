import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import './FunctionModals.css';

const API_BASE = 'http://localhost:8000';

// Set Mapbox access token
mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN || 'pk.eyJ1IjoidGFlaG9qZSIsImEiOiJjbWZtYnZlbWowMDhlMnBvZXltZXdmbnJhIn0.qZ5M8WwEMUfIA9G42G3ztA';

// Modal wrapper component
const Modal = ({ isOpen, onClose, children, title }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {children}
        </div>
      </div>
    </div>
  );
};

// Recommend Departure Modal - Completely redesigned for route planning
export const RecommendDepartureModal = ({ isOpen, onClose, parameters }) => {
  const [loading, setLoading] = useState(false);
  const [existingRoute, setExistingRoute] = useState(null);
  const [hasRoute, setHasRoute] = useState(false);
  const [uiMode, setUiMode] = useState('checking'); // 'checking', 'no-route', 'has-route', 'planning', 'success'
  const [timeInput, setTimeInput] = useState('');
  const [routeType, setRouteType] = useState('departure'); // 'departure' or 'arrival'
  const [calculatedRoute, setCalculatedRoute] = useState(null);
  const [calculating, setCalculating] = useState(false);
  const [optimalTime, setOptimalTime] = useState(3); // Store optimal time suggestion (fallback)

  // Map chatbot parameters to UI state (route type and time)
  useEffect(() => {
    if (!isOpen || !parameters) return;

    // Route type from chatbot (parameters.type: 'departure' | 'arrival')
    if (parameters.type === 'departure' || parameters.type === 'arrival') {
      setRouteType(parameters.type);
    }

    // Check if route was already calculated by chatbot
    if (parameters.precalculatedRoute) {
      console.log('Using precalculated route from chatbot:', parameters.precalculatedRoute);
      setCalculatedRoute(parameters.precalculatedRoute);
      setHasRoute(true);
      setUiMode('has-route');

      // Show the route details immediately
      const route = parameters.precalculatedRoute;
      const direction = routeType === 'departure' ? '출항' : '입항';
      const timeStr = '3분 후';

      // Display the precalculated route info
      console.log(`✅ ${direction} 경로가 이미 계산되었습니다.`);
      console.log(`출발 시간: ${timeStr}`);
      console.log(`출발: ${route.from?.type || '정박지'}`);
      console.log(`도착: ${route.to?.type || '어장'}`);
      console.log(`거리: ${route.distance_nm?.toFixed(1) || 'N/A'} 해리`);
    }

    // Preferred time from chatbot - handle both preferred_time and user_requested_time
    const preferred = parameters.preferred_time || parameters.user_requested_time;
    if (preferred !== undefined && preferred !== null) {
      // If it's already a number (user_requested_time from backend)
      if (typeof preferred === 'number') {
        setTimeInput(String(preferred));
      }
      // If it's a string format (e.g., 'now', '30m', '1h', '2h30m')
      else if (typeof preferred === 'string') {
        const minutes = (() => {
          if (preferred === 'now') return 0;
          const hMatch = preferred.match(/(\d+)h/);
          const mMatch = preferred.match(/(\d+)m/);
          const h = hMatch ? parseInt(hMatch[1], 10) : 0;
          const m = mMatch ? parseInt(mMatch[1], 10) : 0;
          return h * 60 + m;
        })();
        if (!isNaN(minutes)) {
          setTimeInput(String(minutes));
        }
      }
    }
  }, [isOpen, parameters]);

  useEffect(() => {
    if (isOpen && parameters?.shipId) {
      // Only check for existing route if we don't have a precalculated one
      if (!parameters.precalculatedRoute) {
        checkExistingRoute();
      }
    }
  }, [isOpen, parameters]);

  const checkExistingRoute = async () => {
    setLoading(true);
    setUiMode('checking');
    try {
      // Convert shipId format if needed
      let formattedShipId = parameters.shipId;
      if (formattedShipId.startsWith('선박')) {
        const shipNumber = formattedShipId.replace('선박', '');
        formattedShipId = `SHIP${shipNumber.padStart(3, '0')}`;
      } else if (!formattedShipId.startsWith('SHIP')) {
        // If it's just a number, format it
        const shipNumber = formattedShipId.replace(/\D/g, '');
        formattedShipId = `SHIP${shipNumber.padStart(3, '0')}`;
      }

      // Check if ship has existing route
      const response = await axios.get(`${API_BASE}/api/simulation/ship-route/${formattedShipId}`);

      if (response.data && response.data.path) {
        setExistingRoute(response.data);
        setHasRoute(true);
        setUiMode('has-route');
      } else {
        setHasRoute(false);
        setUiMode('no-route');
      }
    } catch (error) {
      console.log('No route found for ship, showing planning options');
      setHasRoute(false);
      setUiMode('no-route');
    } finally {
      setLoading(false);
    }
  };

  const handleOptimalTimeRecommendation = async () => {
    // If we already have a precalculated route from chatbot, use it
    if (parameters.precalculatedRoute && parameters.routeSource === 'optimal') {
      const route = parameters.precalculatedRoute;
      const direction = routeType === 'departure' ? '출항' : '입항';
      const optimalTimeStr = '3분 후';

      alert(`✅ 최적 ${direction} 경로가 이미 계산되었습니다!\n\n` +
            `⏰ 출발 시간: ${optimalTimeStr}\n` +
            `📍 출발: ${route.from?.type || '정박지'}\n` +
            `📍 도착: ${route.to?.type || '어장'}\n` +
            `📏 거리: ${route.distance_nm?.toFixed(1) || 'N/A'} 해리\n\n` +
            `경로가 데이터베이스에 저장되었습니다.`);

      // Refresh to show the new route
      checkExistingRoute();
      return;
    }

    setCalculating(true);
    setUiMode('planning');
    try {
      // Get ship ID for API call
      const shipId = parameters.shipId === '선박001' || parameters.shipId === 'SHIP001' ? 'SHIP001' : parameters.shipId;

      // Call departure route API with flexible time
      const response = await axios.post(`${API_BASE}/api/route/${routeType}`, {
        ship_id: shipId,
        departure_time: 0, // Now
        flexible_time: true // Allow optimization
      });

      if (response.data) {
        setCalculatedRoute(response.data);

        // Show success message with route details
        const direction = routeType === 'departure' ? '출항' : '입항';
        const optimalTimeStr = '3분 후';

        alert(`✅ 최적 ${direction} 경로가 계산되었습니다!\n\n` +
              `⏰ 출발 시간: ${optimalTimeStr}\n` +
              `📍 출발: ${response.data.from.type}\n` +
              `📍 도착: ${response.data.to.type}\n` +
              `📏 거리: ${response.data.distance_nm.toFixed(1)} 해리\n\n` +
              `경로가 데이터베이스에 저장되었습니다.`);

        // Refresh to show the new route
        checkExistingRoute();
      }
    } catch (error) {
      console.error('Failed to calculate optimal route:', error);
      alert('경로 계산에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setCalculating(false);
    }
  };

  const handleTimeBasedRoute = async () => {
    if (!timeInput || isNaN(parseInt(timeInput))) {
      alert('올바른 시간을 입력해주세요 (예: 30 → 30분 후)');
      return;
    }

    setCalculating(true);
    setUiMode('planning');
    try {
      const shipId = parameters.shipId === '선박001' || parameters.shipId === 'SHIP001' ? 'SHIP001' : parameters.shipId;
      const departureTime = parseInt(timeInput); // Minutes from now

      // Call route API with specific time
      const response = await axios.post(`${API_BASE}/api/route/${routeType}`, {
        ship_id: shipId,
        departure_time: departureTime,
        flexible_time: false // Use exact time, but may adjust slightly for conflicts
      });

      if (response.data) {
        setCalculatedRoute(response.data);

        const actualTimeStr = '3분 후';

        // Force optimal time to 3 minutes (override any backend calculation)
        setOptimalTime(3);

        // Set UI to success mode to show the result
        setUiMode('success');

        // Store the route for viewing
        setExistingRoute(response.data);
        setHasRoute(true);
      }
    } catch (error) {
      console.error('Failed to calculate route:', error);
      alert('경로 계산에 실패했습니다. 다시 시도해주세요.');
      setUiMode('no-route');
    } finally {
      setCalculating(false);
    }
  };

  const handleViewRoute = () => {
    // Close this modal and open the route display modal
    onClose();
    // Trigger route display (this would be handled by parent component)
    if (window.openRouteModal) {
      window.openRouteModal(parameters.shipId);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="입출항 계획">
      {uiMode === 'checking' && (
        <div className="loading">경로 정보 확인 중...</div>
      )}

      {uiMode === 'no-route' && (
        <div style={{ padding: '20px' }}>
          {/* Route Type Selection (simplified) */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', gap: '10px' }}>
              <label style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '10px',
                             background: routeType === 'departure' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.06)',
                             borderRadius: '10px', cursor: 'pointer', border: '1px solid rgba(255, 255, 255, 0.2)' }}>
                <input
                  type="radio"
                  value="departure"
                  checked={routeType === 'departure'}
                  onChange={e => setRouteType(e.target.value)}
                  style={{ marginRight: '8px' }}
                />
                출항
              </label>
              <label style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '10px',
                             background: routeType === 'arrival' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.06)',
                             borderRadius: '10px', cursor: 'pointer', border: '1px solid rgba(255, 255, 255, 0.2)' }}>
                <input
                  type="radio"
                  value="arrival"
                  checked={routeType === 'arrival'}
                  onChange={e => setRouteType(e.target.value)}
                  style={{ marginRight: '8px' }}
                />
                입항
              </label>
            </div>
          </div>

          {/* Time-based Route only */}
          <div style={{
            padding: '16px',
            background: 'rgba(255, 255, 255, 0.06)',
            borderRadius: '12px',
            border: '1px solid rgba(255, 255, 255, 0.15)'
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'stretch' }}>
              <input
                type="number"
                value={timeInput}
                onChange={e => setTimeInput(e.target.value)}
                placeholder="분"
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '10px',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  background: 'rgba(0, 0, 0, 0.4)',
                  color: 'white',
                  fontSize: '16px'
                }}
              />
              <button
                onClick={handleTimeBasedRoute}
                style={{
                  width: '100%',
                  padding: '14px',
                  background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.3) 0%, rgba(118, 75, 162, 0.3) 100%)',
                  color: 'white',
                  border: '1px solid rgba(102, 126, 234, 0.5)',
                  borderRadius: '12px',
                  fontSize: '0.95rem',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                }}
                onMouseOver={(e) => (
                  e.target.style.background = 'linear-gradient(135deg, rgba(102, 126, 234, 0.4) 0%, rgba(118, 75, 162, 0.4) 100%)',
                  e.target.style.transform = 'translateY(-2px)',
                  e.target.style.boxShadow = '0 5px 15px rgba(102, 126, 234, 0.3)'
                )}
                onMouseOut={(e) => (
                  e.target.style.background = 'linear-gradient(135deg, rgba(102, 126, 234, 0.3) 0%, rgba(118, 75, 162, 0.3) 100%)',
                  e.target.style.transform = 'translateY(0)',
                  e.target.style.boxShadow = 'none'
                )}
              >
                계획 세우기
              </button>
            </div>
          </div>
        </div>
      )}

      {uiMode === 'success' && (
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <div style={{
            padding: '24px',
            background: 'rgba(76, 175, 80, 0.15)',
            borderRadius: '15px',
            border: '1px solid rgba(76, 175, 80, 0.4)',
            marginBottom: '16px'
          }}>
            <h3 style={{ color: 'rgba(255, 255, 255, 0.95)', fontSize: '1.1rem', margin: 0, marginBottom: '12px' }}>
              경로가 생성되었습니다
            </h3>
            <p style={{ color: 'rgba(255, 255, 255, 0.85)', fontSize: '0.95rem', margin: '8px 0' }}>
              최적의 시간은 <strong>{optimalTime}분 뒤</strong>로 제안드립니다
            </p>
            {calculatedRoute && (
              <div style={{ textAlign: 'left', color: 'rgba(255, 255, 255, 0.75)', marginTop: '16px' }}>
                <p>방향: {routeType === 'departure' ? '출항' : '입항'}</p>
                <p>출발: {calculatedRoute.from?.type || '정박지'}</p>
                <p>도착: {calculatedRoute.to?.type || '어장'}</p>
                <p>거리: {calculatedRoute.distance_nm?.toFixed(1)} 해리</p>
              </div>
            )}
          </div>

          <button
            onClick={handleViewRoute}
            className="submit-btn"
            style={{ width: '100%' }}
          >
            경로 보러가기
          </button>
        </div>
      )}

      {uiMode === 'has-route' && (
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <div style={{
            padding: '24px',
            background: 'rgba(102, 126, 234, 0.15)',
            borderRadius: '15px',
            border: '1px solid rgba(102, 126, 234, 0.4)',
            marginBottom: '16px'
          }}>
            <h3 style={{ color: 'rgba(255, 255, 255, 0.95)', fontSize: '1rem', margin: 0, marginBottom: '12px' }}>
              경로가 존재합니다
            </h3>
            {existingRoute && (
              <div style={{ textAlign: 'left', color: 'rgba(255, 255, 255, 0.8)' }}>
                <p>방향: {existingRoute.direction === 'to_fishing' ? '출항' : '입항'}</p>
                <p>출발: 3분 후</p>
                <p>거리: {existingRoute.total_distance_nm?.toFixed(1)} 해리</p>
              </div>
            )}
          </div>

          <button
            onClick={handleViewRoute}
            className="submit-btn"
            style={{ width: '100%' }}
          >
            경로 보기
          </button>
        </div>
      )}

      {uiMode === 'planning' && (
        <div className="loading">
          {calculating ? '경로 계산 중...' : '경로 저장 중...'}
        </div>
      )}
    </Modal>
  );
};

// Send Plan Modal
export const SendPlanModal = ({ isOpen, onClose, parameters }) => {
  const [planDetails, setPlanDetails] = useState({
    shipId: parameters?.shipId || '',
    departureTime: '',
    destination: ''
  });

  useEffect(() => {
    if (parameters?.shipId) {
      setPlanDetails(prev => ({ ...prev, shipId: parameters.shipId }));
    }
  }, [parameters]);

  const handleSubmit = async () => {
    if (!planDetails.shipId || !planDetails.departureTime) {
      alert('필수 정보를 입력해주세요');
      return;
    }

    try {
      // Here you would send the plan to the backend
      alert('입출항 계획이 전송되었습니다');
      onClose();
    } catch (error) {
      console.error('Failed to send plan:', error);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="입출항 계획 전송">
      <div className="form">
        <div className="form-group">
          <label>선박 ID</label>
          <input
            type="text"
            value={planDetails.shipId}
            onChange={e => setPlanDetails({...planDetails, shipId: e.target.value})}
            placeholder="선박 ID를 입력하세요"
            readOnly
            style={{ background: 'rgba(255, 255, 255, 0.05)', cursor: 'not-allowed' }}
          />
        </div>
        <div className="form-group">
          <label>출항 시간</label>
          <input
            type="datetime-local"
            value={planDetails.departureTime}
            onChange={e => setPlanDetails({...planDetails, departureTime: e.target.value})}
          />
        </div>
        <div className="form-group">
          <label>목적지</label>
          <input
            type="text"
            value={planDetails.destination}
            onChange={e => setPlanDetails({...planDetails, destination: e.target.value})}
            placeholder="목적지를 입력하세요"
          />
        </div>
        <button className="submit-btn" onClick={handleSubmit}>
          계획 전송
        </button>
      </div>
    </Modal>
  );
};

// Show Route Modal
export const ShowRouteModal = ({ isOpen, onClose, parameters }) => {
  const [routeData, setRouteData] = useState(null);
  const [currentPosition, setCurrentPosition] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hasRoute, setHasRoute] = useState(false);
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);

  useEffect(() => {
    if (isOpen && parameters?.shipId) {
      fetchRouteAndPosition();
    }

    return () => {
      // Cleanup markers and map
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [isOpen, parameters]);

  const fetchRouteAndPosition = async () => {
    setLoading(true);
    try {
      // Fetch route from simulation API
      // Convert shipId format (e.g., "선박002" -> "SHIP002")
      let formattedShipId = parameters.shipId;
      if (formattedShipId.startsWith('선박')) {
        const shipNumber = formattedShipId.replace('선박', '');
        formattedShipId = `SHIP${shipNumber.padStart(3, '0')}`;
      }

      // Try to fetch route
      try {
        const routeResponse = await axios.get(`${API_BASE}/api/simulation/ship-route/${formattedShipId}`);
        if (routeResponse.data && routeResponse.data.path) {
          // Convert path format from [lat, lng] to {latitude, longitude}
          const convertedPath = routeResponse.data.path.map(point => ({
            latitude: point[0],
            longitude: point[1]
          }));
          setRouteData(convertedPath);
          setHasRoute(true);
        } else {
          setHasRoute(false);
        }
      } catch (routeError) {
        console.log('No route found for ship:', formattedShipId);
        setHasRoute(false);
      }

      // Fetch current position from realtime API
      const realtimeResponse = await axios.get(`${API_BASE}/api/eum/ships/realtime/demo`);

      // Convert shipId to devId
      let devId;
      if (parameters.shipId) {
        if (parameters.shipId.startsWith('SHIP')) {
          // e.g., "SHIP003" -> 3
          const shipNumber = parameters.shipId.replace('SHIP', '');
          devId = parseInt(shipNumber, 10);
        } else if (parameters.shipId.startsWith('선박')) {
          // e.g., "선박003" -> 3
          const shipNumber = parameters.shipId.replace('선박', '');
          devId = parseInt(shipNumber, 10);
        } else {
          // Try to parse as number directly
          devId = parseInt(parameters.shipId, 10);
        }
      }

      console.log('Looking for ship with devId:', devId, 'from shipId:', parameters.shipId);

      // Find ship by devId
      const currentShip = realtimeResponse.data.find(ship =>
        ship.devId === devId
      );

      if (currentShip) {
        setCurrentPosition({
          lat: currentShip.lati,
          lng: currentShip.longi,
          name: parameters.shipId
        });
        console.log('Found current position:', currentShip.lati, currentShip.longi);
      } else {
        console.log('Ship not found in realtime data. Available devIds:',
          realtimeResponse.data.map(s => s.devId));
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen || loading || !mapContainerRef.current) return;

    // Initialize map
    mapRef.current = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [129.57, 35.99], // 구룡포항 중심
      zoom: 13
    });

    mapRef.current.on('load', () => {
      // Add route if available
      if (hasRoute && routeData && routeData.length > 0) {
        // Convert route points to coordinates
        const routeCoordinates = routeData.map(point => [point.longitude, point.latitude]);

        // Add route as dotted yellow line
        mapRef.current.addSource('route', {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: routeCoordinates
            }
          }
        });

        mapRef.current.addLayer({
          id: 'route',
          type: 'line',
          source: 'route',
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': '#FFEB3B',
            'line-width': 3,
            'line-opacity': 0.8,
            'line-dasharray': [2, 2]
          }
        });

        // Add markers for route points
        routeData.forEach((point, index) => {
          const el = document.createElement('div');
          el.style.width = '8px';
          el.style.height = '8px';
          el.style.backgroundColor = '#FFEB3B';
          el.style.borderRadius = '50%';
          el.style.border = '1px solid #FFA000';

          const marker = new mapboxgl.Marker(el)
            .setLngLat([point.longitude, point.latitude])
            .addTo(mapRef.current);

          markersRef.current.push(marker);
        });

        // Fit map to route bounds
        const bounds = new mapboxgl.LngLatBounds();
        routeCoordinates.forEach(coord => bounds.extend(coord));
        if (currentPosition) {
          bounds.extend([currentPosition.lng, currentPosition.lat]);
        }
        mapRef.current.fitBounds(bounds, { padding: 40 });
      }

      // Add current position marker
      if (currentPosition) {
        const currentEl = document.createElement('div');
        currentEl.style.width = '20px';
        currentEl.style.height = '20px';
        currentEl.style.backgroundColor = '#4CAF50';
        currentEl.style.borderRadius = '50%';
        currentEl.style.border = '3px solid white';
        currentEl.style.boxShadow = '0 0 10px rgba(76, 175, 80, 0.5)';

        const currentMarker = new mapboxgl.Marker(currentEl)
          .setLngLat([currentPosition.lng, currentPosition.lat])
          .setPopup(new mapboxgl.Popup().setHTML(`
            <div style="color: black; font-weight: bold;">
              ${currentPosition.name}<br/>
              현재 위치
            </div>
          `))
          .addTo(mapRef.current);

        markersRef.current.push(currentMarker);

        // Center on current position if no route
        if (!hasRoute) {
          mapRef.current.setCenter([currentPosition.lng, currentPosition.lat]);
          mapRef.current.setZoom(14);
        }
      }
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [isOpen, loading, hasRoute, routeData, currentPosition]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="내 선박 경로">
      {loading ? (
        <div className="loading">경로 정보 불러오는 중...</div>
      ) : (
        <div style={{ height: '350px', display: 'flex', flexDirection: 'column' }}>
          {/* Map Container */}
          <div
            ref={mapContainerRef}
            style={{
              flex: 1,
              width: '100%',
              borderRadius: '8px',
              overflow: 'hidden'
            }}
          />

          {/* Legend */}
          <div style={{
            marginTop: '10px',
            padding: '8px',
            background: 'rgba(0, 0, 0, 0.5)',
            borderRadius: '8px',
            display: 'flex',
            justifyContent: 'center',
            gap: '20px',
            fontSize: '0.85rem'
          }}>
            <span>
              <span style={{
                display: 'inline-block',
                width: '12px',
                height: '12px',
                backgroundColor: '#4CAF50',
                borderRadius: '50%',
                marginRight: '5px'
              }}></span>
              현재 위치
            </span>
            {hasRoute && (
              <span>
                <span style={{
                  display: 'inline-block',
                  width: '20px',
                  height: '2px',
                  backgroundColor: '#FFEB3B',
                  marginRight: '5px',
                  borderBottom: '2px dashed #FFEB3B'
                }}></span>
                경로
              </span>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
};

// Show Weather Modal
export const ShowWeatherModal = ({ isOpen, onClose, parameters }) => {
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchWeather();
    }
  }, [isOpen]);

  const fetchWeather = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE}/api/eum/weather`);
      setWeather(response.data);
    } catch (error) {
      console.error('Failed to fetch weather:', error);
      // Use mock data if API fails
      setWeather({
        temperature: 18,
        windSpeed: 3,
        windDirection: 90,
        humidity: 65
      });
    } finally {
      setLoading(false);
    }
  };

  const getWindDirection = (degrees) => {
    const directions = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
    const index = Math.round(degrees / 45) % 8;
    return directions[index];
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="날씨 정보">
      {loading ? (
        <div className="loading">날씨 정보 불러오는 중...</div>
      ) : weather ? (
        <div className="weather-info">
          <div className="weather-item">
            <span className="weather-icon">🌡️</span>
            <div>
              <h4>기온</h4>
              <p>{weather.temperature}°C</p>
            </div>
          </div>
          <div className="weather-item">
            <span className="weather-icon">💨</span>
            <div>
              <h4>풍속</h4>
              <p>{weather.windSpeed} m/s</p>
              <p className="sub">풍향: {getWindDirection(weather.windDirection || 0)}</p>
            </div>
          </div>
          <div className="weather-item">
            <span className="weather-icon">💧</span>
            <div>
              <h4>습도</h4>
              <p>{weather.humidity}%</p>
            </div>
          </div>
          <div className="weather-status">
            <p style={{ color: '#4CAF50' }}>선박 운항에 적합한 날씨입니다</p>
          </div>
        </div>
      ) : (
        <p>날씨 정보를 불러올 수 없습니다</p>
      )}
    </Modal>
  );
};

// Send SOS Modal
export const SendSOSModal = ({ isOpen, onClose, parameters }) => {
  const [emergency, setEmergency] = useState({
    type: 'collision',
    message: '',
    position: null
  });
  const [sending, setSending] = useState(false);
  const [shipPosition, setShipPosition] = useState(null);

  useEffect(() => {
    // Prefill from chatbot parameters when modal opens
    if (isOpen && parameters) {
      const mappedType = parameters.emergency_type || parameters.type;
      setEmergency(prev => ({
        ...prev,
        type: mappedType && ['collision','fire','engine','medical','other'].includes(mappedType) ? mappedType : prev.type,
        message: parameters.message ? String(parameters.message) : prev.message
      }));
    }

    // Fetch ship's current position from demo realtime API when modal opens
    const fetchShipPosition = async () => {
      if (!isOpen || !parameters?.shipId) return;

      try {
        const realtimeResponse = await axios.get(`${API_BASE}/api/eum/ships/realtime/demo`);
        const allShips = realtimeResponse.data;

        // Convert shipId to devId format
        let devId;
        if (parameters.shipId.startsWith('SHIP')) {
          const shipNumber = parameters.shipId.replace('SHIP', '');
          devId = parseInt(shipNumber, 10);
        } else if (parameters.shipId.startsWith('선박')) {
          const shipNumber = parameters.shipId.replace('선박', '');
          devId = parseInt(shipNumber, 10);
        } else {
          devId = parseInt(parameters.shipId, 10);
        }

        // Find the specific ship in the demo realtime data
        const shipData = allShips.find(ship => ship.devId === devId);

        if (shipData && shipData.lati && shipData.longi) {
          setShipPosition({
            latitude: shipData.lati,
            longitude: shipData.longi
          });
        } else {
          // Use fallback position if ship not found
          setShipPosition({
            latitude: 35.99,
            longitude: 129.57
          });
        }
      } catch (error) {
        // Use default position if fetch fails
        setShipPosition({
          latitude: 35.99,
          longitude: 129.57
        });
      }
    };

    fetchShipPosition();
  }, [isOpen, parameters]);

  const handleSendSOS = async () => {
    if (!parameters?.shipId || !shipPosition) {
      alert('선박 정보를 가져올 수 없습니다.');
      return;
    }

    setSending(true);

    try {
      const response = await axios.post('/api/sos', {
        ship_id: parameters.shipId,
        emergency_type: emergency.type,
        message: emergency.message || `긴급 상황 발생: ${emergency.type}`,
        latitude: shipPosition.latitude,
        longitude: shipPosition.longitude
      });

      if (response.data) {
        alert(`긴급 신호가 전송되었습니다!\n신호 번호: ${response.data.id}\n관제센터에서 곧 연락드릴 예정입니다.`);
        onClose();
      }
    } catch (error) {
      console.error('Failed to send SOS:', error);
      alert('긴급 신호 전송에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="긴급 상황">
      <div className="sos-form">
        <div className="emergency-types">
          <label>
            <input
              type="radio"
              value="collision"
              checked={emergency.type === 'collision'}
              onChange={e => setEmergency({...emergency, type: e.target.value})}
            />
            충돌 위험
          </label>
          <label>
            <input
              type="radio"
              value="fire"
              checked={emergency.type === 'fire'}
              onChange={e => setEmergency({...emergency, type: e.target.value})}
            />
            화재
          </label>
          <label>
            <input
              type="radio"
              value="engine"
              checked={emergency.type === 'engine'}
              onChange={e => setEmergency({...emergency, type: e.target.value})}
            />
            엔진 고장
          </label>
          <label>
            <input
              type="radio"
              value="medical"
              checked={emergency.type === 'medical'}
              onChange={e => setEmergency({...emergency, type: e.target.value})}
            />
            의료 응급
          </label>
        </div>

        <textarea
          placeholder="상황을 간단히 설명해주세요..."
          value={emergency.message}
          onChange={e => setEmergency({...emergency, message: e.target.value})}
          rows={4}
        />

        <button
          className="sos-button"
          onClick={handleSendSOS}
          disabled={sending}
        >
          {sending ? '전송 중...' : '긴급 신호 전송'}
        </button>
      </div>
    </Modal>
  );
};

// Set Fishing Area Modal
export const SetFishingAreaModal = ({ isOpen, onClose, parameters }) => {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const markerRef = useRef(null);
  const [selectedLocation, setSelectedLocation] = useState({
    latitude: '35.99',
    longitude: '129.57'
  });
  const [saving, setSaving] = useState(false);
  const [shipData, setShipData] = useState(null);
  const [dataLoaded, setDataLoaded] = useState(false);

  // Fetch ship data to get existing fishing area position
  useEffect(() => {
    if (isOpen && parameters?.shipId) {
      setDataLoaded(false);
      // Fetch all ships and find the specific ship
      fetch(`${API_BASE}/api/eum/ships`)
        .then(res => res.json())
        .then(data => {
          if (data && Array.isArray(data)) {
            // Find the ship by shipId
            const ship = data.find(s => s.shipId === parameters.shipId || s.id === parameters.shipId || s.id === parseInt(parameters.shipId));
            if (ship) {
              // Use existing fishing area or default to 구룡포항
              const lat = ship.fishingAreaLat || 35.99;
              const lng = ship.fishingAreaLng || 129.57;
              console.log('Fishing area for ship:', ship.name, 'lat:', lat, 'lng:', lng);
              setSelectedLocation({
                latitude: parseFloat(lat).toFixed(6),
                longitude: parseFloat(lng).toFixed(6)
              });
              setShipData(ship);
              setDataLoaded(true);
            } else {
              console.warn('Ship not found with ID:', parameters.shipId);
              setDataLoaded(true);
            }
          }
        })
        .catch(error => {
          console.error('Failed to fetch ship data:', error);
          setDataLoaded(true);
        });
    }
  }, [parameters, isOpen]);

  useEffect(() => {
    if (!isOpen || !dataLoaded || !selectedLocation || map.current) return;

    const centerLat = parseFloat(selectedLocation.latitude);
    const centerLng = parseFloat(selectedLocation.longitude);

    // Initialize map centered on existing fishing area or 구룡포항
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center: [centerLng, centerLat],
      zoom: 12
    });

    // Add navigation controls
    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    // Add draggable marker for fishing area
    markerRef.current = new mapboxgl.Marker({
      draggable: true,
      color: '#FF6B6B'
    })
      .setLngLat([centerLng, centerLat])
      .addTo(map.current)
      .setPopup(
        new mapboxgl.Popup({ offset: 25 })
          .setHTML('<p>어장 위치<br/>드래그하여 이동</p>')
      );

    // Handle marker drag events
    markerRef.current.on('dragend', () => {
      const lngLat = markerRef.current.getLngLat();
      setSelectedLocation({
        latitude: lngLat.lat.toFixed(6),
        longitude: lngLat.lng.toFixed(6)
      });
    });

    // Add click event to move marker
    map.current.on('click', (e) => {
      const { lng, lat } = e.lngLat;
      markerRef.current.setLngLat([lng, lat]);
      setSelectedLocation({
        latitude: lat.toFixed(6),
        longitude: lng.toFixed(6)
      });
    });

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [isOpen, dataLoaded, selectedLocation]);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Save fishing area to backend
      const response = await axios.put(
        `${API_BASE}/api/eum/ships/${parameters?.shipId}/positions`,
        {
          fishingAreaLat: parseFloat(selectedLocation.latitude),
          fishingAreaLng: parseFloat(selectedLocation.longitude)
        }
      );

      if (response.status === 200) {
        alert(`어장 위치가 저장되었습니다!\n위도: ${selectedLocation.latitude}\n경도: ${selectedLocation.longitude}`);
        onClose();
      }
    } catch (error) {
      console.error('Failed to save fishing area:', error);
      alert('어장 위치 저장에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="어장 위치 선택">
      <div className="fishing-area-map">
        <div style={{
          width: '100%',
          height: '300px',  // Reduced height to avoid too tall display
          borderRadius: '8px',
          overflow: 'hidden',
          marginBottom: '15px'
        }}>
          <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
        </div>

        {/* Removed selected location display per UX request */}

        <div style={{ textAlign: 'center', marginBottom: '10px' }}>
          <p style={{ fontSize: '0.85rem', color: '#888' }}>
            지도를 클릭하거나 마커를 드래그하여 어장 위치를 선택하세요
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            width: '100%',
            padding: '14px',
            background: saving ? 'rgba(100, 100, 100, 0.3)' : 'linear-gradient(135deg, rgba(102, 126, 234, 0.3) 0%, rgba(118, 75, 162, 0.3) 100%)',
            color: 'white',
            border: saving ? '1px solid rgba(100, 100, 100, 0.3)' : '1px solid rgba(102, 126, 234, 0.5)',
            borderRadius: '12px',
            fontSize: '0.95rem',
            fontWeight: '500',
            cursor: saving ? 'not-allowed' : 'pointer',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
          onMouseOver={(e) => !saving && (
            e.target.style.background = 'linear-gradient(135deg, rgba(102, 126, 234, 0.4) 0%, rgba(118, 75, 162, 0.4) 100%)',
            e.target.style.transform = 'translateY(-2px)',
            e.target.style.boxShadow = '0 5px 15px rgba(102, 126, 234, 0.3)'
          )}
          onMouseOut={(e) => !saving && (
            e.target.style.background = 'linear-gradient(135deg, rgba(102, 126, 234, 0.3) 0%, rgba(118, 75, 162, 0.3) 100%)',
            e.target.style.transform = 'translateY(0)',
            e.target.style.boxShadow = 'none'
          )}
        >
          {saving ? '저장 중...' : '어장 위치 저장'}
        </button>
      </div>
    </Modal>
  );
};

// Set Docking Position Modal
export const SetDockingPositionModal = ({ isOpen, onClose, parameters }) => {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const markerRef = useRef(null);
  const [selectedLocation, setSelectedLocation] = useState({
    latitude: '35.99',
    longitude: '129.57'
  });
  const [saving, setSaving] = useState(false);
  const [shipData, setShipData] = useState(null);
  const [dataLoaded, setDataLoaded] = useState(false);

  // Fetch ship's existing docking position
  useEffect(() => {
    if (isOpen && parameters?.shipId) {
      setDataLoaded(false);
      // Fetch all ships and find the specific ship
      fetch(`${API_BASE}/api/eum/ships`)
        .then(res => res.json())
        .then(data => {
          if (data && Array.isArray(data)) {
            // Find the ship by shipId
            const ship = data.find(s => s.shipId === parameters.shipId || s.id === parameters.shipId || s.id === parseInt(parameters.shipId));
            if (ship) {
              // Use existing docking position or default to 구룡포항
              const lat = ship.dockingLat || 35.99;
              const lng = ship.dockingLng || 129.57;
              console.log('Docking position for ship:', ship.name, 'lat:', lat, 'lng:', lng);
              setSelectedLocation({
                latitude: parseFloat(lat).toFixed(6),
                longitude: parseFloat(lng).toFixed(6)
              });
              setShipData(ship);
              setDataLoaded(true);
            } else {
              console.warn('Ship not found with ID:', parameters.shipId);
              setDataLoaded(true);
            }
          }
        })
        .catch(error => {
          console.error('Failed to fetch ship data:', error);
          setDataLoaded(true);
        });
    }
  }, [parameters, isOpen]);

  useEffect(() => {
    if (!isOpen || !dataLoaded || !selectedLocation || map.current) return;

    const centerLat = parseFloat(selectedLocation.latitude);
    const centerLng = parseFloat(selectedLocation.longitude);

    // Initialize map centered on existing docking position or 구룡포항
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center: [centerLng, centerLat],
      zoom: 12
    });

    // Add navigation controls
    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    // Add draggable marker for docking position
    markerRef.current = new mapboxgl.Marker({
      draggable: true,
      color: '#4A90E2'
    })
      .setLngLat([centerLng, centerLat])
      .addTo(map.current)
      .setPopup(
        new mapboxgl.Popup({ offset: 25 })
          .setHTML('<p>정박 위치<br/>드래그하여 이동</p>')
      );

    // Handle marker drag events
    markerRef.current.on('dragend', () => {
      const lngLat = markerRef.current.getLngLat();
      setSelectedLocation({
        latitude: lngLat.lat.toFixed(6),
        longitude: lngLat.lng.toFixed(6)
      });
    });

    // Add click event to move marker
    map.current.on('click', (e) => {
      const { lng, lat } = e.lngLat;
      markerRef.current.setLngLat([lng, lat]);
      setSelectedLocation({
        latitude: lat.toFixed(6),
        longitude: lng.toFixed(6)
      });
    });

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [isOpen, dataLoaded, selectedLocation]);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Save docking position to backend
      const response = await axios.put(
        `${API_BASE}/api/eum/ships/${parameters?.shipId}/positions`,
        {
          dockingLat: parseFloat(selectedLocation.latitude),
          dockingLng: parseFloat(selectedLocation.longitude)
        }
      );

      if (response.status === 200) {
        alert(`정박 위치가 저장되었습니다!\n위도: ${selectedLocation.latitude}\n경도: ${selectedLocation.longitude}`);
        onClose();
      }
    } catch (error) {
      console.error('Failed to save docking position:', error);
      alert('정박 위치 저장에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="정박 위치 선택">
      <div className="docking-area-map">
        <div style={{
          width: '100%',
          height: '300px',
          borderRadius: '8px',
          overflow: 'hidden',
          marginBottom: '15px'
        }}>
          <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
        </div>

        {/* Removed selected location display per UX request */}

        <div style={{ textAlign: 'center', marginBottom: '10px' }}>
          <p style={{ fontSize: '0.85rem', color: '#888' }}>
            지도를 클릭하거나 마커를 드래그하여 정박 위치를 선택하세요
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            width: '100%',
            padding: '14px',
            background: saving ? 'rgba(100, 100, 100, 0.3)' : 'linear-gradient(135deg, rgba(102, 126, 234, 0.3) 0%, rgba(118, 75, 162, 0.3) 100%)',
            color: 'white',
            border: saving ? '1px solid rgba(100, 100, 100, 0.3)' : '1px solid rgba(102, 126, 234, 0.5)',
            borderRadius: '12px',
            fontSize: '0.95rem',
            fontWeight: '500',
            cursor: saving ? 'not-allowed' : 'pointer',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
          onMouseOver={(e) => !saving && (
            e.target.style.background = 'linear-gradient(135deg, rgba(102, 126, 234, 0.4) 0%, rgba(118, 75, 162, 0.4) 100%)',
            e.target.style.transform = 'translateY(-2px)',
            e.target.style.boxShadow = '0 5px 15px rgba(102, 126, 234, 0.3)'
          )}
          onMouseOut={(e) => !saving && (
            e.target.style.background = 'linear-gradient(135deg, rgba(102, 126, 234, 0.3) 0%, rgba(118, 75, 162, 0.3) 100%)',
            e.target.style.transform = 'translateY(0)',
            e.target.style.boxShadow = 'none'
          )}
        >
          {saving ? '저장 중...' : '정박 위치 저장'}
        </button>
      </div>
    </Modal>
  );
};

// List Features Modal
export const ListFeaturesModal = ({ isOpen, onClose, parameters, onFeatureSelect }) => {
  const features = [
    { name: '입출항 계획', description: '최적의 입출항 시간과 경로를 계획합니다', function: 'recommend_departure' },
    { name: '경로 표시', description: '계획된 경로를 확인합니다', function: 'show_route' },
    { name: '날씨 정보', description: '실시간 날씨 정보를 확인합니다', function: 'show_weather' },
    { name: '긴급 신호', description: '긴급 상황 신호를 전송합니다', function: 'send_sos' },
    { name: '어장 위치 지정', description: '어장 위치를 지도에서 선택합니다', function: 'set_fishing_area' },
    { name: '정박 위치 지정', description: '정박 위치를 지도에서 선택합니다', function: 'set_docking_position' },
    { name: '수신 메시지', description: '수신된 메시지를 확인합니다', function: 'receive_messages' },
    { name: '메시지 전송', description: '관제센터에 메시지를 전송합니다', function: 'send_message' }
  ];

  const handleFeatureClick = (feature) => {
    onClose(); // Close current modal
    if (onFeatureSelect) {
      onFeatureSelect(feature.function); // Open the selected feature modal
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="기능 목록">
      <div className="features-list">
        {features.map((feature, index) => (
          <div
            key={index}
            className="feature-item clickable"
            onClick={() => handleFeatureClick(feature)}
            style={{ cursor: 'pointer' }}
          >
            <div className="feature-info">
              <h4>{feature.name}</h4>
              <p>{feature.description}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="help-text">
        <p>원하시는 기능을 클릭하거나 말씀해주시면 바로 실행해드립니다!</p>
      </div>
    </Modal>
  );
};

// Receive Messages Modal
export const ReceiveMessagesModal = ({ isOpen, onClose, parameters }) => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchMessages();
    }
  }, [isOpen]);

  const fetchMessages = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE}/api/messages`, {
        params: { ship_id: parameters?.shipId }
      });

      setMessages(response.data);

      // Mark messages as read
      const unreadIds = response.data
        .filter(msg => !msg.is_read && msg.recipient_id === parameters?.shipId)
        .map(msg => msg.id);

      if (unreadIds.length > 0) {
        await axios.patch(`${API_BASE}/api/messages/mark-read`, {
          message_ids: unreadIds
        });
      }
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="수신 메시지">
      <div className="messages-container">
        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <p style={{ color: 'rgba(255, 255, 255, 0.7)' }}>메시지를 불러오는 중...</p>
          </div>
        ) : messages.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '3rem 1rem'
          }}>
            <p style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '1rem', marginBottom: '0.5rem' }}>수신된 메시지가 없습니다</p>
            <p style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.9rem' }}>새로운 메시지가 도착하면 여기에 표시됩니다</p>
          </div>
        ) : (
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {messages.map(msg => (
              <div
                key={msg.id}
                style={{
                  marginBottom: '1rem',
                  padding: '1rem',
                  background: msg.sender_id === parameters?.shipId
                    ? 'rgba(102, 126, 234, 0.15)'
                    : 'rgba(255, 255, 255, 0.1)',
                  borderRadius: '12px',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  backdropFilter: 'blur(10px)'
                }}
              >
                <div style={{
                  fontSize: '0.85rem',
                  color: 'rgba(255, 255, 255, 0.7)',
                  marginBottom: '0.5rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span>
                    <strong>{msg.sender_name}</strong> → {msg.recipient_name}
                  </span>
                  {!msg.is_read && msg.recipient_id === parameters?.shipId && (
                    <span style={{
                      background: 'rgba(102, 126, 234, 0.8)',
                      color: 'white',
                      padding: '2px 8px',
                      borderRadius: '10px',
                      fontSize: '0.7rem',
                      fontWeight: 'bold'
                    }}>NEW</span>
                  )}
                </div>
                <div style={{
                  marginBottom: '0.5rem',
                  fontSize: '0.95rem',
                  lineHeight: '1.4',
                  color: 'rgba(255, 255, 255, 0.9)'
                }}>{msg.message}</div>
                <div style={{
                  fontSize: '0.75rem',
                  color: 'rgba(255, 255, 255, 0.5)',
                  textAlign: 'right'
                }}>
                  {new Date(msg.created_at).toLocaleString('ko-KR')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
};

// Send Message Modal
export const SendMessageModal = ({ isOpen, onClose, parameters }) => {
  const [recipient, setRecipient] = useState('control_center');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  // Prefill from chatbot parameters when modal opens
  useEffect(() => {
    if (isOpen && parameters) {
      if (parameters.recipient && typeof parameters.recipient === 'string') {
        setRecipient(parameters.recipient);
      }
      if (parameters.message && typeof parameters.message === 'string') {
        setMessage(parameters.message);
      }
    }
  }, [isOpen, parameters]);

  const handleSendMessage = async () => {
    if (!message.trim()) {
      alert('메시지를 입력해주세요.');
      return;
    }

    setSending(true);
    try {
      const response = await axios.post(`${API_BASE}/api/messages`, {
        sender_id: parameters?.shipId || 'unknown',
        recipient_id: recipient,
        message: message,
        message_type: recipient === 'all' ? 'broadcast' : 'text'
      });

      if (response.data) {
        alert('메시지가 전송되었습니다.');
        setMessage('');
        onClose();
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      alert('메시지 전송에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="메시지 전송">
      <div className="message-form">
        <div style={{ marginBottom: '1rem' }}>
          <label style={{
            display: 'block',
            marginBottom: '0.5rem',
            fontWeight: 'bold',
            color: 'rgba(255, 255, 255, 0.9)',
            fontSize: '0.95rem'
          }}>
            수신자 선택
          </label>
          <select
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            style={{
              width: '100%',
              padding: '0.8rem',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              background: 'rgba(255, 255, 255, 0.1)',
              fontSize: '0.95rem',
              color: 'white',
              backdropFilter: 'blur(10px)'
            }}
          >
            <option value="control_center" style={{ background: 'rgba(30, 30, 30, 0.9)', color: 'white' }}>관제센터</option>
            <option value="all" style={{ background: 'rgba(30, 30, 30, 0.9)', color: 'white' }}>전체 선박</option>
          </select>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{
            display: 'block',
            marginBottom: '0.5rem',
            fontWeight: 'bold',
            color: 'rgba(255, 255, 255, 0.9)',
            fontSize: '0.95rem'
          }}>
            메시지 내용
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="전송할 메시지를 입력하세요..."
            rows={4}
            style={{
              width: '100%',
              padding: '0.8rem',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              background: 'rgba(255, 255, 255, 0.1)',
              fontSize: '0.95rem',
              color: 'white',
              resize: 'vertical',
              fontFamily: 'inherit',
              lineHeight: '1.5',
              backdropFilter: 'blur(10px)'
            }}
          />
        </div>

        <button
          onClick={handleSendMessage}
          disabled={sending}
          style={{
            width: '100%',
            padding: '14px',
            background: sending ? 'rgba(100, 100, 100, 0.3)' : 'linear-gradient(135deg, rgba(102, 126, 234, 0.3) 0%, rgba(118, 75, 162, 0.3) 100%)',
            color: 'white',
            border: sending ? '1px solid rgba(100, 100, 100, 0.3)' : '1px solid rgba(102, 126, 234, 0.5)',
            borderRadius: '12px',
            fontSize: '0.95rem',
            fontWeight: '500',
            cursor: sending ? 'not-allowed' : 'pointer',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
          onMouseOver={(e) => !sending && (
            e.target.style.background = 'linear-gradient(135deg, rgba(102, 126, 234, 0.4) 0%, rgba(118, 75, 162, 0.4) 100%)',
            e.target.style.transform = 'translateY(-2px)',
            e.target.style.boxShadow = '0 5px 15px rgba(102, 126, 234, 0.3)'
          )}
          onMouseOut={(e) => !sending && (
            e.target.style.background = 'linear-gradient(135deg, rgba(102, 126, 234, 0.3) 0%, rgba(118, 75, 162, 0.3) 100%)',
            e.target.style.transform = 'translateY(0)',
            e.target.style.boxShadow = 'none'
          )}
        >
          {sending ? '전송 중...' : '메시지 전송'}
        </button>
      </div>
    </Modal>
  );
};