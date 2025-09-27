import React from 'react';

const Emergency = ({ sosAlerts, onSOSUpdate }) => {
  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
      <div style={{ marginBottom: '1rem' }}>
        <h3 style={{ margin: 0 }}>긴급 신호</h3>
      </div>

      {sosAlerts.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>현재 긴급 신호가 없습니다</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {sosAlerts.map(alert => (
            <div key={alert.id} style={{
              padding: '0.8rem',
              background: 'rgba(255, 100, 100, 0.1)',
              borderRadius: '10px',
              borderLeft: '3px solid #ff6b6b',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)'
            }}>
              <div style={{ fontWeight: '600', color: '#ff6b6b', marginBottom: '0.5rem' }}>
                {alert.ship_name || alert.ship_id}
              </div>
              <div style={{ fontSize: '0.85rem', marginBottom: '0.3rem', color: 'var(--text-secondary)' }}>
                <strong>유형:</strong> {
                  alert.alert_type === 'engine_failure' ? '엔진 고장' :
                  alert.alert_type === 'collision' ? '충돌 위험' :
                  alert.alert_type === 'medical' ? '의료 응급' :
                  alert.alert_type === 'fire' ? '화재' :
                  alert.alert_type === 'weather' ? '악천후' :
                  '기타'
                }
              </div>
              <div style={{ fontSize: '0.85rem', marginBottom: '0.3rem', color: 'var(--text-secondary)' }}>
                <strong>위치:</strong> {alert.latitude?.toFixed(6)}, {alert.longitude?.toFixed(6)}
              </div>
              {alert.message && (
                <div style={{ fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                  <strong>메시지:</strong> {alert.message}
                </div>
              )}

              {alert.status === 'active' && (
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button
                    onClick={() => onSOSUpdate(alert.id, 'responding')}
                    style={{
                      flex: 1,
                      padding: '0.4rem',
                      background: 'rgba(255, 255, 255, 0.1)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      backdropFilter: 'blur(10px)',
                      WebkitBackdropFilter: 'blur(10px)',
                      transition: 'all 0.3s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                    }}
                  >
                    대응 시작
                  </button>
                  <button
                    onClick={() => onSOSUpdate(alert.id, 'resolved')}
                    style={{
                      flex: 1,
                      padding: '0.4rem',
                      background: 'rgba(76, 175, 80, 0.2)',
                      color: '#4CAF50',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      backdropFilter: 'blur(10px)',
                      WebkitBackdropFilter: 'blur(10px)',
                      transition: 'all 0.3s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.backgroundColor = 'rgba(76, 175, 80, 0.3)';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.backgroundColor = 'rgba(76, 175, 80, 0.2)';
                    }}
                  >
                    해결됨
                  </button>
                </div>
              )}

              {alert.status === 'responding' && (
                <div style={{
                  padding: '0.3rem 0.6rem',
                  background: 'rgba(255, 193, 7, 0.2)',
                  color: '#FFC107',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  textAlign: 'center',
                  marginTop: '0.5rem'
                }}>
                  대응 중
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Emergency;