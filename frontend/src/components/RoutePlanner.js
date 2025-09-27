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
      const schedules = ships.map((ship, index) => {
        // Ships with index 1-4 (SHIP002-SHIP005) are departure
        // Ships with index 5-9 (SHIP006-SHIP010) are arrival
        // Note: index starts at 0, so ship 2 is index 1
        const tripType = (index >= 1 && index <= 4) ? 'departure' : 'arrival';

        return {
          shipId: ship.shipId || ship.ship_id,
          name: ship.name || ship.shipName,
          type: ship.type || '화물선',
          departureTime: `00:${String(index * 5).padStart(2, '0')}`, // 5분 간격
          arrivalTime: `00:${String(index * 5 + 7).padStart(2, '0')}`, // 7분 항해
          speed: 10 + index, // 속도 (노트)
          tripType: tripType,
          dockingLocation: {
            lat: ship.dockingLat || ship.lati,
            lng: ship.dockingLng || ship.longi
          },
          fishingLocation: ship.type === '어선' ? {
            lat: ship.fishingAreaLat || ship.lati + 0.01,
            lng: ship.fishingAreaLng || ship.longi + 0.01
          } : null,
          status: 'scheduled' // scheduled, departed, arrived
        };
      });
      setShipSchedules(schedules);
    };

    fetchSchedules();
  }, [ships]);

  const handleScheduleClick = (schedule) => {
    // Toggle selection if clicking the same schedule
    if (selectedSchedule?.shipId === schedule.shipId) {
      setSelectedSchedule(null);
      if (onSelectShip) {
        onSelectShip(null);
      }
      return;
    }

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
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      <h3 style={{
        marginBottom: '1rem'
      }}>
        출항 스케줄
      </h3>

      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
        paddingRight: '5px'
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
                className={`schedule-card ${selectedSchedule?.shipId === schedule.shipId ? 'selected' : ''}`}
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
                    gap: '0.5rem',
                    flex: 1,
                    minWidth: 0
                  }}>
                    <Ship size={16} color="#667eea" />
                    <span style={{
                      fontWeight: '600',
                      fontSize: '0.95rem',
                      color: 'var(--text-primary)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      flex: 1
                    }}>
                      {schedule.name}
                    </span>
                  </div>
                  <span className="status-badge" style={{
                    background: getTripTypeColor(schedule.tripType),
                    color: 'white',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    marginLeft: '0.5rem'
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
                    {schedule.departureTime} → {schedule.arrivalTime}
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
    </div>
  );
};

export default RoutePlanner;