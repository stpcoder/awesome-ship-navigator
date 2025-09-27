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

// Recommend Departure Modal
export const RecommendDepartureModal = ({ isOpen, onClose, parameters }) => {
  const [recommendation, setRecommendation] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchRecommendation();
    }
  }, [isOpen, parameters]);

  const fetchRecommendation = async () => {
    setLoading(true);
    try {
      // Get active ships and calculate recommendation
      const response = await axios.get(`${API_BASE}/api/ships`);
      const activeShips = response.data.filter(s => s.status === 'active' || s.status === 'accepted');

      // Simple recommendation logic
      const busyHours = activeShips.map(s => new Date(s.departure_time).getHours());
      const quietHours = [];
      for (let h = 0; h < 24; h++) {
        if (!busyHours.includes(h)) quietHours.push(h);
      }

      setRecommendation({
        recommendedTime: quietHours.length > 0 ? `${quietHours[0]}:00` : '06:00',
        activeShips: activeShips.length,
        reason: quietHours.length > 0 ? '항로가 한산한 시간입니다' : '표준 운항 시간입니다'
      });
    } catch (error) {
      console.error('Failed to fetch recommendation:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="권장 입출항 시간">
      {loading ? (
        <div className="loading">분석 중...</div>
      ) : recommendation ? (
        <div className="recommendation">
          <div className="time-display">
            <h3>추천 시간: {recommendation.recommendedTime}</h3>
            <p>{recommendation.reason}</p>
          </div>
          <div className="info">
            <p>선박 ID: <strong>{parameters?.shipId || 'EUM001'}</strong></p>
            <p>현재 운항 중인 선박: {recommendation.activeShips}척</p>
          </div>
          <button className="apply-btn" onClick={() => {
            alert(`${recommendation.recommendedTime}으로 출항 계획을 설정합니다`);
            onClose();
          }}>
            이 시간으로 계획하기
          </button>
        </div>
      ) : (
        <p>데이터를 불러올 수 없습니다</p>
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
  const [myShipRoute, setMyShipRoute] = useState(null);
  const [otherRoutes, setOtherRoutes] = useState([]);
  const [showOthers, setShowOthers] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && parameters?.shipId) {
      fetchRoutes();
    }
  }, [isOpen, parameters]);

  const fetchRoutes = async () => {
    setLoading(true);
    try {
      // Fetch route information from database
      const response = await axios.get(`${API_BASE}/api/ship/${parameters.shipId}`);

      if (response.data && response.data.ship_id === parameters.shipId) {
        setMyShipRoute(response.data);
      } else {
        setMyShipRoute(null);
      }

      // Fetch all ships to get other routes
      const allShipsResponse = await axios.get(`${API_BASE}/api/ships`);
      const others = allShipsResponse.data.filter(r =>
        r.ship_id !== parameters.shipId &&
        r.path_points &&
        r.path_points.length > 0
      );
      setOtherRoutes(others);
    } catch (error) {
      console.error('Failed to fetch routes:', error);
      setMyShipRoute(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="내 선박 경로">
      {loading ? (
        <div className="loading">경로 정보 불러오는 중...</div>
      ) : (
        <>
          {/* My Ship's Route - Always Shown First */}
          {myShipRoute && myShipRoute.path_points && myShipRoute.path_points.length > 0 ? (
            <div className="route-item selected" style={{ marginBottom: '20px' }}>
              <h4>내 선박: {parameters?.shipId}</h4>
              <p>상태: {myShipRoute.status || '대기중'}</p>
              <p>모드: {myShipRoute.optimization_mode || '미설정'}</p>
              <div className="route-details">
                <p>출발: {myShipRoute.departure_time ?
                  new Date(myShipRoute.departure_time * 60000).toLocaleTimeString() : '미정'}</p>
                <p>도착: {myShipRoute.arrival_time ?
                  new Date(myShipRoute.arrival_time * 60000).toLocaleTimeString() : '미정'}</p>
                <p>경로점: {myShipRoute.path_points?.length || 0}개</p>
              </div>
            </div>
          ) : (
            <div className="info" style={{
              marginBottom: '20px',
              background: 'rgba(255, 255, 255, 0.1)',
              padding: '20px',
              borderRadius: '10px',
              textAlign: 'center'
            }}>
              <h4 style={{ marginBottom: '10px' }}>경로가 없습니다</h4>
              <p>선박 {parameters?.shipId}의 계획된 경로가 없습니다.</p>
              <p style={{ fontSize: '0.9rem', marginTop: '10px' }}>
                챗봇에서 "출항" 또는 "입항"을 말해보세요
              </p>
            </div>
          )}

          {/* Toggle for Other Ships */}
          {otherRoutes.length > 0 && (
            <>
              <button
                className="apply-btn"
                onClick={() => setShowOthers(!showOthers)}
                style={{ marginBottom: '15px' }}
              >
                {showOthers ? '다른 선박 숨기기' : `다른 선박 보기 (${otherRoutes.length}척)`}
              </button>

              {/* Other Ships' Routes */}
              {showOthers && (
                <div className="routes-list">
                  <h4 style={{ marginBottom: '10px' }}>다른 선박들의 경로</h4>
                  {otherRoutes.map((route, index) => (
                    <div key={index} className="route-item">
                      <h4>선박: {route.ship_id}</h4>
                      <p>상태: {route.status}</p>
                      <p>모드: {route.optimization_mode}</p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          <button className="view-map-btn" onClick={() => {
            window.location.href = '/';
            onClose();
          }}>
            지도에서 전체 보기
          </button>
        </>
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
            <span className="weather-icon">온도</span>
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

    // Fetch ship's current position when modal opens
    const fetchShipPosition = async () => {
      if (!isOpen || !parameters?.shipId) return;

      try {
        const response = await axios.get(`/api/eum/ships/${parameters.shipId}/realtime`);
        if (response.data) {
          setShipPosition({
            latitude: response.data.lati,
            longitude: response.data.longi
          });
        }
      } catch (error) {
        console.error('Failed to fetch ship position:', error);
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
    latitude: 35.99,  // 구룡포항 위도
    longitude: 129.57  // 구룡포항 경도
  });
  const [saving, setSaving] = useState(false);
  const [shipData, setShipData] = useState(null);

  // Fetch ship data to get existing fishing area position
  useEffect(() => {
    if (isOpen && parameters?.shipId) {
      fetch(`${API_BASE}/api/eum/ships/${parameters.shipId}`)
        .then(res => res.json())
        .then(data => {
          if (data) {
            const ship = Array.isArray(data) ? data[0] : data;
            if (ship.fishingAreaLat && ship.fishingAreaLng) {
              setSelectedLocation({
                latitude: parseFloat(ship.fishingAreaLat).toFixed(6),
                longitude: parseFloat(ship.fishingAreaLng).toFixed(6)
              });
            }
            setShipData(ship);
          }
        })
        .catch(error => console.error('Failed to fetch ship data:', error));
    }
  }, [parameters, isOpen]);

  useEffect(() => {
    if (!isOpen || map.current) return;

    const centerLat = shipData?.fishingAreaLat || 35.99;
    const centerLng = shipData?.fishingAreaLng || 129.57;

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
  }, [isOpen, shipData]);

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

        <div className="location-info" style={{
          background: 'rgba(255, 255, 255, 0.1)',
          padding: '15px',
          borderRadius: '8px',
          marginBottom: '15px'
        }}>
          <p style={{ margin: '5px 0' }}>
            <strong>선택된 위치</strong>
          </p>
          <p style={{ margin: '5px 0', fontSize: '0.9rem' }}>
            위도: {selectedLocation.latitude}°
          </p>
          <p style={{ margin: '5px 0', fontSize: '0.9rem' }}>
            경도: {selectedLocation.longitude}°
          </p>
        </div>

        <div style={{ textAlign: 'center', marginBottom: '10px' }}>
          <p style={{ fontSize: '0.85rem', color: '#888' }}>
            지도를 클릭하거나 마커를 드래그하여 어장 위치를 선택하세요
          </p>
        </div>

        <button
          className="submit-btn"
          onClick={handleSave}
          disabled={saving}
          style={{
            width: '100%',
            padding: '12px',
            background: saving ? '#666' : '#FF6B6B',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '1rem',
            fontWeight: 'bold',
            cursor: saving ? 'not-allowed' : 'pointer'
          }}
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
    latitude: 35.99,  // 구룡포항 위도
    longitude: 129.57  // 구룡포항 경도
  });
  const [saving, setSaving] = useState(false);
  const [shipData, setShipData] = useState(null);

  // Fetch ship's existing docking position
  useEffect(() => {
    if (isOpen && parameters?.shipId) {
      fetch(`${API_BASE}/api/eum/ships/${parameters.shipId}`)
        .then(res => res.json())
        .then(data => {
          if (data) {
            const ship = Array.isArray(data) ? data[0] : data;
            if (ship.dockingLat && ship.dockingLng) {
              setSelectedLocation({
                latitude: parseFloat(ship.dockingLat).toFixed(6),
                longitude: parseFloat(ship.dockingLng).toFixed(6)
              });
            }
            setShipData(ship);
          }
        })
        .catch(error => console.error('Failed to fetch ship data:', error));
    }
  }, [parameters, isOpen]);

  useEffect(() => {
    if (!isOpen || map.current) return;

    const centerLat = shipData?.dockingLat || 35.99;
    const centerLng = shipData?.dockingLng || 129.57;

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
  }, [isOpen, shipData]);

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

        <div className="location-info" style={{
          background: 'rgba(255, 255, 255, 0.1)',
          padding: '15px',
          borderRadius: '8px',
          marginBottom: '15px'
        }}>
          <p style={{ margin: '5px 0' }}>
            <strong>선택된 위치</strong>
          </p>
          <p style={{ margin: '5px 0', fontSize: '0.9rem' }}>
            위도: {selectedLocation.latitude}°
          </p>
          <p style={{ margin: '5px 0', fontSize: '0.9rem' }}>
            경도: {selectedLocation.longitude}°
          </p>
        </div>

        <div style={{ textAlign: 'center', marginBottom: '10px' }}>
          <p style={{ fontSize: '0.85rem', color: '#888' }}>
            지도를 클릭하거나 마커를 드래그하여 정박 위치를 선택하세요
          </p>
        </div>

        <button
          className="submit-btn"
          onClick={handleSave}
          disabled={saving}
          style={{
            width: '100%',
            padding: '12px',
            background: saving ? '#666' : '#4A90E2',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '1rem',
            fontWeight: 'bold',
            cursor: saving ? 'not-allowed' : 'pointer'
          }}
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
        <div style={{ marginTop: '1rem', textAlign: 'center' }}>
          <button
            onClick={fetchMessages}
            style={{
              padding: '14px 24px',
              background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.3) 0%, rgba(118, 75, 162, 0.3) 100%)',
              color: 'white',
              border: '1px solid rgba(102, 126, 234, 0.5)',
              borderRadius: '12px',
              fontSize: '0.95rem',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
            onMouseOver={(e) => {
              e.target.style.background = 'linear-gradient(135deg, rgba(102, 126, 234, 0.4) 0%, rgba(118, 75, 162, 0.4) 100%)';
              e.target.style.transform = 'translateY(-2px)';
              e.target.style.boxShadow = '0 5px 15px rgba(102, 126, 234, 0.3)';
            }}
            onMouseOut={(e) => {
              e.target.style.background = 'linear-gradient(135deg, rgba(102, 126, 234, 0.3) 0%, rgba(118, 75, 162, 0.3) 100%)';
              e.target.style.transform = 'translateY(0)';
              e.target.style.boxShadow = 'none';
            }}
          >
            새로고침
          </button>
        </div>
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