import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Ship, Anchor, MapPin, Clock } from 'lucide-react';

const API_BASE = 'http://localhost:8000';

const RoutePlanner = ({ ships, selectedShip, onSelectShip, onShipRouteClick }) => {
  const [shipSchedules, setShipSchedules] = useState([]);
  const [selectedSchedule, setSelectedSchedule] = useState(null);

  // Clear selection when selectedShip changes
  useEffect(() => {
    if (!selectedShip) {
      setSelectedSchedule(null);
    }
  }, [selectedShip]);

  // Fetch ship schedules from database
  useEffect(() => {
    const fetchSchedules = async () => {
      try {
        const response = await axios.get(`${API_BASE}/api/simulation/schedules`);
        setShipSchedules(response.data);
      } catch (error) {
        console.error('Failed to fetch ship schedules:', error);
        // Fallback to ships data with calculated schedules
        generateSchedulesFromShips();
      }
    };

    const generateSchedulesFromShips = () => {
      // Generate schedules from ships data for display
      const schedules = ships.map((ship, index) => ({
        shipId: ship.shipId || ship.ship_id,
        name: ship.name || ship.shipName,
        type: ship.type || '화물선',
        departureTime: `00:${String(index * 5).padStart(2, '0')}`, // 5분 간격
        arrivalTime: `00:${String(index * 5 + 7).padStart(2, '0')}`, // 7분 항해
        speed: 10 + index, // 속도 (노트)
        tripType: index % 2 === 0 ? 'departure' : 'arrival', // 출항/입항 교대
        dockingLocation: {
          lat: ship.dockingLat || ship.lati,
          lng: ship.dockingLng || ship.longi
        },
        fishingLocation: ship.type === '어선' ? {
          lat: ship.fishingAreaLat || ship.lati + 0.01,
          lng: ship.fishingAreaLng || ship.longi + 0.01
        } : null,
        status: 'scheduled' // scheduled, departed, arrived
      }));
      setShipSchedules(schedules);
    };

    fetchSchedules();
  }, [ships]);

  const handleScheduleClick = (schedule) => {
    setSelectedSchedule(schedule);

    // Find and select the ship
    const ship = ships.find(s =>
      s.shipId === schedule.shipId ||
      s.ship_id === schedule.shipId ||
      s.name === schedule.name
    );

    if (ship && onSelectShip) {
      onSelectShip(ship);
    }

    // Trigger route display if available
    if (onShipRouteClick) {
      onShipRouteClick(schedule.shipId);
    }
  };

  const formatLocation = (location) => {
    if (!location) return 'N/A';
    return `(${location.lat?.toFixed(2)}, ${location.lng?.toFixed(2)})`;
  };

  const getTripTypeLabel = (type) => {
    return type === 'departure' ? '출항' : '입항';
  };

  const getTripTypeColor = (type) => {
    return type === 'departure' ? '#4CAF50' : '#667eea';
  };

  const getStatusColor = (status) => {
    switch(status) {
      case 'scheduled': return '#FFC107';
      case 'departed': return '#4CAF50';
      case 'arrived': return '#9E9E9E';
      default: return '#666';
    }
  };

  return (
    <div className="panel" style={{
      height: 'auto',
      minHeight: '400px',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <h3 style={{
        marginBottom: '1rem'
      }}>
        출항 스케줄
      </h3>

      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column'
      }}>
        {shipSchedules.length === 0 ? (
          <div style={{
            padding: '1rem',
            textAlign: 'center',
            color: 'var(--text-secondary)',
            fontSize: '0.9rem'
          }}>
            스케줄 정보를 불러오는 중...
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {shipSchedules.map((schedule, index) => (
              <div
                key={schedule.shipId}
                onClick={() => handleScheduleClick(schedule)}
                style={{
                  padding: '0.75rem',
                  background: selectedSchedule?.shipId === schedule.shipId
                    ? 'linear-gradient(135deg, rgba(102, 126, 234, 0.2), rgba(118, 75, 162, 0.2))'
                    : 'rgba(255, 255, 255, 0.05)',
                  backdropFilter: 'blur(10px)',
                  WebkitBackdropFilter: 'blur(10px)',
                  border: selectedSchedule?.shipId === schedule.shipId
                    ? '1px solid rgba(102, 126, 234, 0.5)'
                    : '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  transform: selectedSchedule?.shipId === schedule.shipId ? 'scale(1.02)' : 'scale(1)',
                }}
                onMouseEnter={(e) => {
                  if (selectedSchedule?.shipId !== schedule.shipId) {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                    e.currentTarget.style.transform = 'scale(1.01)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedSchedule?.shipId !== schedule.shipId) {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                    e.currentTarget.style.transform = 'scale(1)';
                  }
                }}
              >
                {/* Ship Header */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '0.5rem'
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}>
                    <Ship size={16} color="#667eea" />
                    <span style={{
                      fontWeight: '600',
                      fontSize: '0.95rem',
                      color: 'var(--text-primary)'
                    }}>
                      {schedule.name}
                    </span>
                    <span style={{
                      fontSize: '0.8rem',
                      color: 'var(--text-secondary)',
                      padding: '0.15rem 0.4rem',
                      background: 'rgba(255, 255, 255, 0.1)',
                      borderRadius: '4px'
                    }}>
                      {schedule.shipId}
                    </span>
                  </div>
                  <span style={{
                    fontSize: '0.85rem',
                    padding: '0.2rem 0.5rem',
                    background: getTripTypeColor(schedule.tripType),
                    color: 'white',
                    borderRadius: '6px',
                    fontWeight: '500'
                  }}>
                    {getTripTypeLabel(schedule.tripType)}
                  </span>
                </div>

                {/* Schedule Times */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginBottom: '0.4rem',
                  fontSize: '0.9rem'
                }}>
                  <Clock size={14} color="#FF6B00" />
                  <span style={{ color: 'var(--text-primary)' }}>
                    {schedule.departureTime} 출발 → {schedule.arrivalTime} 도착
                  </span>
                </div>

                {/* Locations */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.3rem',
                  fontSize: '0.85rem',
                  color: 'var(--text-secondary)'
                }}>
                  {schedule.tripType === 'departure' ? (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Anchor size={12} />
                        <span>정박지: {formatLocation(schedule.dockingLocation)}</span>
                      </div>
                      {schedule.fishingLocation && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <MapPin size={12} />
                          <span>어장: {formatLocation(schedule.fishingLocation)}</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      {schedule.fishingLocation && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <MapPin size={12} />
                          <span>어장: {formatLocation(schedule.fishingLocation)}</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Anchor size={12} />
                        <span>정박지: {formatLocation(schedule.dockingLocation)}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Selected Schedule Details */}
      {selectedSchedule && (
        <div style={{
          marginTop: '1rem',
          padding: '0.75rem',
          background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.1), rgba(118, 75, 162, 0.1))',
          borderRadius: '10px',
          border: '1px solid rgba(102, 126, 234, 0.3)',
          fontSize: '0.85rem'
        }}>
          <div style={{ fontWeight: '600', marginBottom: '0.5rem', color: '#667eea' }}>
            선택된 스케줄 상세
          </div>
          <div style={{ marginBottom: '0.3rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>선박명: </span>
            <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>
              {selectedSchedule.name} ({selectedSchedule.shipId})
            </span>
          </div>
          <div style={{ marginBottom: '0.3rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>운항: </span>
            <span style={{ color: getTripTypeColor(selectedSchedule.tripType), fontWeight: '500' }}>
              {selectedSchedule.departureTime} {getTripTypeLabel(selectedSchedule.tripType)}
            </span>
          </div>
          <div style={{ marginBottom: '0.3rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>경로: </span>
            <span style={{ color: 'var(--text-primary)' }}>
              {selectedSchedule.tripType === 'departure' ? '정박지 → 어장' : '어장 → 정박지'}
            </span>
          </div>
          <div style={{ marginBottom: '0.3rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>도착 예정: </span>
            <span style={{ color: 'var(--text-primary)' }}>
              {selectedSchedule.arrivalTime}
            </span>
          </div>
          {selectedSchedule.speed && (
            <div>
              <span style={{ color: 'var(--text-secondary)' }}>속도: </span>
              <span style={{ color: 'var(--text-primary)' }}>
                {selectedSchedule.speed} 노트
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default RoutePlanner;