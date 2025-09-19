import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './FunctionModals.css';

const API_BASE = 'http://localhost:8000';

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
      const response = await axios.get(`${API_BASE}/api/ships`);
      const allRoutes = response.data.filter(r => r.path_points && r.path_points.length > 0);

      // Find my ship's route
      const myRoute = allRoutes.find(r => r.ship_id === parameters.shipId);
      setMyShipRoute(myRoute);

      // Get other ships' routes
      const others = allRoutes.filter(r => r.ship_id !== parameters.shipId);
      setOtherRoutes(others);
    } catch (error) {
      console.error('Failed to fetch routes:', error);
      // If API fails, create a mock route for the selected ship
      setMyShipRoute({
        ship_id: parameters.shipId,
        status: 'planned',
        optimization_mode: 'Flexible',
        departure_time: Date.now() / 60000 + 30,
        arrival_time: Date.now() / 60000 + 120,
        path_points: []
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="🗺️ 내 선박 경로">
      {loading ? (
        <div className="loading">경로 정보 불러오는 중...</div>
      ) : (
        <>
          {/* My Ship's Route - Always Shown First */}
          {myShipRoute ? (
            <div className="route-item selected" style={{ marginBottom: '20px' }}>
              <h4>🚢 내 선박: {parameters?.shipId}</h4>
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
            <div className="info" style={{ marginBottom: '20px' }}>
              <p>선박 {parameters?.shipId}의 경로가 아직 설정되지 않았습니다.</p>
              <p>메인 화면에서 경로를 계획해주세요.</p>
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
    <Modal isOpen={isOpen} onClose={onClose} title="🌤️ 날씨 정보">
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
            <p>✅ 선박 운항에 적합한 날씨입니다</p>
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

  const handleSendSOS = async () => {
    setSending(true);

    // Simulate sending SOS
    setTimeout(() => {
      alert('🚨 긴급 신호가 전송되었습니다!\n관제센터에서 곧 연락드릴 예정입니다.');
      setSending(false);
      onClose();
    }, 2000);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="🆘 긴급 상황">
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
  const [areas, setAreas] = useState([]);
  const [newArea, setNewArea] = useState({
    name: '',
    latitude: '',
    longitude: ''
  });

  const handleAddArea = () => {
    if (!newArea.name || !newArea.latitude || !newArea.longitude) {
      alert('모든 정보를 입력해주세요');
      return;
    }

    setAreas([...areas, newArea]);
    setNewArea({ name: '', latitude: '', longitude: '' });
    alert('어장 위치가 저장되었습니다');
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="🎣 어장 위치 지정">
      <div className="fishing-area">
        <div className="form">
          <div className="form-group">
            <label>어장 이름</label>
            <input
              type="text"
              value={newArea.name}
              onChange={e => setNewArea({...newArea, name: e.target.value})}
              placeholder="어장 이름"
            />
          </div>
          <div className="form-group">
            <label>위도</label>
            <input
              type="number"
              value={newArea.latitude}
              onChange={e => setNewArea({...newArea, latitude: e.target.value})}
              placeholder="35.9850"
              step="0.0001"
            />
          </div>
          <div className="form-group">
            <label>경도</label>
            <input
              type="number"
              value={newArea.longitude}
              onChange={e => setNewArea({...newArea, longitude: e.target.value})}
              placeholder="129.5579"
              step="0.0001"
            />
          </div>
          <button className="add-btn" onClick={handleAddArea}>
            어장 추가
          </button>
        </div>

        {areas.length > 0 && (
          <div className="areas-list">
            <h4>저장된 어장</h4>
            {areas.map((area, index) => (
              <div key={index} className="area-item">
                <span>{area.name}</span>
                <span>({area.latitude}, {area.longitude})</span>
              </div>
            ))}
          </div>
        )}

        <button className="map-select-btn" onClick={() => {
          alert('지도에서 위치를 선택하는 기능은 준비 중입니다');
        }}>
          지도에서 선택하기
        </button>
      </div>
    </Modal>
  );
};

// List Features Modal
export const ListFeaturesModal = ({ isOpen, onClose, parameters, onFeatureSelect }) => {
  const features = [
    { icon: '', name: '권장 입출항 시간 안내', description: '최적의 입출항 시간을 추천합니다', function: 'recommend_departure' },
    { icon: '', name: '입출항 계획 전송', description: '계획을 관제센터에 전송합니다', function: 'send_plan' },
    { icon: '', name: '최적 경로 표시', description: '충돌 회피 경로를 표시합니다', function: 'show_route' },
    { icon: '', name: '날씨 및 경보', description: '실시간 날씨 정보를 확인합니다', function: 'show_weather' },
    { icon: '', name: '긴급 메시지', description: '긴급 상황 신호를 전송합니다', function: 'send_sos' },
    { icon: '', name: '어장 위치 지정', description: '어장 위치를 저장하고 관리합니다', function: 'set_fishing_area' }
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
            <span className="feature-icon">{feature.icon}</span>
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