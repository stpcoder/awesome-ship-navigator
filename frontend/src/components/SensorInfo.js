import React, { useState } from 'react';

const SensorInfo = ({ sensorData, onSensorSelect }) => {
  const [selectedCCTV, setSelectedCCTV] = useState('');
  const [selectedLiDAR, setSelectedLiDAR] = useState('');
  const [activeMode, setActiveMode] = useState(''); // 'cctv' or 'lidar'

  const handleShowAllCCTV = () => {
    if (activeMode === 'cctv') {
      // Toggle off if already active
      setActiveMode('');
      setSelectedCCTV('');
      // Clear all CCTV markers when toggling off
      if (onSensorSelect) {
        onSensorSelect('clear', null);
      }
    } else {
      // Activate CCTV mode - just show dropdown, no markers
      setActiveMode('cctv');
      setSelectedCCTV('');
      setSelectedLiDAR('');
      // Clear any existing selections
      if (onSensorSelect) {
        onSensorSelect('clear', null);
      }
    }
  };

  const handleShowAllLiDAR = () => {
    if (activeMode === 'lidar') {
      // Toggle off if already active
      setActiveMode('');
      setSelectedLiDAR('');
      // Clear all LiDAR markers when toggling off
      if (onSensorSelect) {
        onSensorSelect('clear', null);
      }
    } else {
      // Activate LiDAR mode - just show dropdown, no markers
      setActiveMode('lidar');
      setSelectedCCTV('');
      setSelectedLiDAR('');
      // Clear any existing selections
      if (onSensorSelect) {
        onSensorSelect('clear', null);
      }
    }
  };

  const handleCCTVSelect = (e) => {
    const cctvId = e.target.value;
    setSelectedCCTV(cctvId);
    setSelectedLiDAR('');

    if (cctvId && onSensorSelect) {
      const cctv = sensorData.cctv?.find(c => c.id.toString() === cctvId);
      if (cctv) {
        onSensorSelect('cctv-single', {
          id: cctv.id,
          name: cctv.name,
          lat: parseFloat(cctv.latitude),
          lng: parseFloat(cctv.longitude),
          address: cctv.address
        });
      }
    } else if (!cctvId && onSensorSelect) {
      // Clear selection when "전체 CCTV 보기" is selected
      onSensorSelect('clear', null);
    }
  };

  const handleLiDARSelect = (e) => {
    const lidarId = e.target.value;
    setSelectedLiDAR(lidarId);
    setSelectedCCTV('');

    if (lidarId && onSensorSelect) {
      const lidar = sensorData.lidar?.find(l => l.id.toString() === lidarId);
      if (lidar) {
        onSensorSelect('lidar-single', {
          id: lidar.id,
          name: lidar.name,
          lat: parseFloat(lidar.latitude),
          lng: parseFloat(lidar.longitude),
          address: lidar.address
        });
      }
    } else if (!lidarId && onSensorSelect) {
      // Clear selection when "전체 LiDAR 보기" is selected
      onSensorSelect('clear', null);
    }
  };

  const handleClear = () => {
    setActiveMode('');
    setSelectedCCTV('');
    setSelectedLiDAR('');
    if (onSensorSelect) {
      onSensorSelect('clear', null);
    }
  };

  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
      <div style={{ marginBottom: '1rem' }}>
        <h3 style={{ margin: 0 }}>종합 정보</h3>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* Button Group */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <button
            onClick={handleShowAllCCTV}
            className={`modern-button ${activeMode === 'cctv' ? 'button-primary' : ''}`}
            style={{ flex: 1 }}
          >
            CCTV
          </button>

          <button
            onClick={handleShowAllLiDAR}
            className={`modern-button ${activeMode === 'lidar' ? 'button-primary' : ''}`}
            style={{ flex: 1 }}
          >
            LiDAR
          </button>
        </div>


        {/* CCTV Dropdown - Show when CCTV mode is active */}
        {activeMode === 'cctv' && (
          <div>
            <label style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontSize: '0.9rem',
              fontWeight: '500',
              color: 'var(--text-secondary)'
            }}>
              CCTV 선택
            </label>
            <select
              value={selectedCCTV}
              onChange={handleCCTVSelect}
              className="modern-select"
            >
              <option value="">전체 CCTV 보기</option>
              {sensorData.cctv?.map(cctv => (
                <option key={cctv.id} value={cctv.id}>
                  {cctv.name} - {cctv.address}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* LiDAR Dropdown - Show when LiDAR mode is active */}
        {activeMode === 'lidar' && (
          <div>
            <label style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontSize: '0.9rem',
              fontWeight: '500',
              color: 'var(--text-secondary)'
            }}>
              특정 LiDAR 선택
            </label>
            <select
              value={selectedLiDAR}
              onChange={handleLiDARSelect}
              className="modern-select"
            >
              <option value="">전체 LiDAR 보기</option>
              {sensorData.lidar?.map(lidar => (
                <option key={lidar.id} value={lidar.id}>
                  {lidar.name} - {lidar.address}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Selected sensor info */}
        {selectedCCTV && sensorData.cctv && (
          <div className="info-item" style={{ borderLeft: '3px solid #4169E1' }}>
            <div style={{ fontWeight: '600', marginBottom: '0.3rem', color: '#4169E1' }}>
              선택된 CCTV
            </div>
            <div>{sensorData.cctv.find(c => c.id.toString() === selectedCCTV)?.name}</div>
          </div>
        )}

        {selectedLiDAR && sensorData.lidar && (
          <div className="info-item" style={{ borderLeft: '3px solid #9b59b6' }}>
            <div style={{ fontWeight: '600', marginBottom: '0.3rem', color: '#9b59b6' }}>
              선택된 LiDAR
            </div>
            <div>{sensorData.lidar.find(l => l.id.toString() === selectedLiDAR)?.name}</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SensorInfo;