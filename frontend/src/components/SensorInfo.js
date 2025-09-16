import React from 'react';

const SensorInfo = ({ sensorData }) => {
  return (
    <div className="panel">
      <h3>센서 정보</h3>

      <div style={{ marginBottom: '1rem' }}>
        <h4 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>
          📹 CCTV ({sensorData.cctv?.length || 0}개)
        </h4>
        <div className="sensor-grid">
          {sensorData.cctv?.slice(0, 4).map(cctv => (
            <div key={cctv.id} className="sensor-item">
              <div style={{ fontWeight: '600', fontSize: '0.85rem' }}>{cctv.name}</div>
              <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.25rem' }}>
                {cctv.address}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#888', marginTop: '0.25rem' }}>
                위치: ({parseFloat(cctv.latitude).toFixed(4)}, {parseFloat(cctv.longitude).toFixed(4)})
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h4 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>
          📡 LiDAR ({sensorData.lidar?.length || 0}개)
        </h4>
        <div className="sensor-grid">
          {sensorData.lidar?.map(lidar => (
            <div key={lidar.id} className="sensor-item">
              <div style={{ fontWeight: '600', fontSize: '0.85rem' }}>{lidar.name}</div>
              <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.25rem' }}>
                {lidar.address}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#888', marginTop: '0.25rem' }}>
                위치: ({parseFloat(lidar.latitude).toFixed(4)}, {parseFloat(lidar.longitude).toFixed(4)})
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SensorInfo;