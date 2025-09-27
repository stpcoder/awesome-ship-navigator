import React, { useState, useEffect } from 'react';

const LiDARStats = ({ lidar, onClose }) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!lidar) return;

    // Fetch real statistics from backend
    const fetchStats = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch('http://localhost:8000/api/eum/lidar/statistics');
        if (!response.ok) {
          throw new Error('Failed to fetch statistics');
        }
        const data = await response.json();

        // Format data for display
        const formattedStats = {
          recent3h: data.recent3h || { entry: 0, exit: 0 },
          last24h: data.last24h || { entry: 0, exit: 0 },
          hourlyData: data.by3hours || []
        };

        setStats(formattedStats);
      } catch (err) {
        console.error('Error fetching LiDAR statistics:', err);
        setError(err.message);
        // Set fallback data
        setStats({
          recent3h: { entry: 0, exit: 0 },
          last24h: { entry: 0, exit: 0 },
          hourlyData: []
        });
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
    // Refresh every 5 minutes
    const interval = setInterval(fetchStats, 300000);
    return () => clearInterval(interval);
  }, [lidar]);

  if (!lidar || !stats) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        width: '320px',
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        borderRadius: '12px',
        border: '2px solid rgba(255, 255, 255, 0.2)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
        overflow: 'hidden',
        zIndex: 1000
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 15px',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.2)'
      }}>
        <span style={{
          color: '#fff',
          fontSize: '14px',
          fontWeight: 'bold'
        }}>
          입출항 통계
        </span>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '20px',
            color: '#fff',
            padding: '0',
            width: '24px',
            height: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          ×
        </button>
      </div>

      {/* LiDAR Info */}
      <div style={{
        margin: '15px',
        padding: '10px',
        background: 'rgba(155, 89, 182, 0.15)',
        borderRadius: '8px',
        fontSize: '13px'
      }}>
        <div style={{ fontWeight: '600', color: '#c39bd3', marginBottom: '5px' }}>
          {lidar.name}
        </div>
        <div style={{ color: '#aaa', fontSize: '12px' }}>
          {lidar.address}
        </div>
      </div>

      {/* Loading or Error State */}
      {loading && (
        <div style={{ padding: '20px', textAlign: 'center', color: '#aaa' }}>
          통계 데이터 로딩 중...
        </div>
      )}

      {error && (
        <div style={{ padding: '10px 15px', color: '#f44336', fontSize: '12px' }}>
          ⚠️ 데이터 로드 실패: {error}
        </div>
      )}

      {/* Statistics */}
      {!loading && stats && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '0 15px 15px' }}>
          {/* Recent 3 Hours */}
          <div style={{
            padding: '12px',
            background: 'rgba(255, 255, 255, 0.05)',
            borderRadius: '10px',
            border: '1px solid rgba(255, 255, 255, 0.1)'
          }}>
            <div style={{ fontSize: '12px', color: '#ccc', marginBottom: '8px' }}>
              최근 3시간
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-around' }}>
              <div>
                <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '4px' }}>입항</div>
                <div style={{ fontSize: '20px', fontWeight: '600', color: '#5dade2' }}>
                  {stats.recent3h.entry}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '4px' }}>출항</div>
                <div style={{ fontSize: '20px', fontWeight: '600', color: '#ec7063' }}>
                  {stats.recent3h.exit}
                </div>
              </div>
            </div>
          </div>

          {/* Last 24 Hours */}
          <div style={{
            padding: '12px',
            background: 'rgba(255, 255, 255, 0.05)',
            borderRadius: '10px',
            border: '1px solid rgba(255, 255, 255, 0.1)'
          }}>
            <div style={{ fontSize: '12px', color: '#ccc', marginBottom: '8px' }}>
              24시간 누적
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-around' }}>
              <div>
                <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '4px' }}>입항</div>
                <div style={{ fontSize: '24px', fontWeight: '600', color: '#5dade2' }}>
                  {stats.last24h.entry}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '4px' }}>출항</div>
                <div style={{ fontSize: '24px', fontWeight: '600', color: '#ec7063' }}>
                  {stats.last24h.exit}
                </div>
              </div>
            </div>
          </div>

          {/* Hourly Breakdown */}
          {stats.hourlyData.length > 0 && (
            <div style={{
              padding: '12px',
              background: 'rgba(255, 255, 255, 0.05)',
              borderRadius: '10px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              maxHeight: '150px',
              overflowY: 'auto'
            }}>
              <div style={{ fontSize: '12px', color: '#ccc', marginBottom: '8px' }}>
                3시간 단위 통계
              </div>
              {stats.hourlyData.slice(-4).reverse().map((item, idx) => (
                <div key={idx} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '11px',
                  padding: '4px 0',
                  borderBottom: idx < 3 ? '1px solid rgba(255,255,255,0.05)' : 'none'
                }}>
                  <span style={{ color: '#aaa' }}>
                    {new Date(item.timestamp).toLocaleString('ko-KR', {
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                  <span>
                    <span style={{ color: '#5dade2', marginRight: '10px' }}>입: {item.entry}</span>
                    <span style={{ color: '#ec7063' }}>출: {item.exit}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      )}
    </div>
  );
};

export default LiDARStats;