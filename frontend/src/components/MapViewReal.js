import React, { useState, useEffect, useRef, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import CCTVMarkerManager from './CCTVMarkerManager';
import LiDARMarkerManager from './LiDARMarkerManager';

// Use the Mapbox access token from environment variable
mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN || 'pk.eyJ1IjoidGFlaG9qZSIsImEiOiJjbWZtYnZlbWowMDhlMnBvZXltZXdmbnJhIn0.qZ5M8WwEMUfIA9G42G3ztA';

const MapViewReal = ({
  ships = [],
  routes = [],
  selectedShip,
  obstacles = [],
  onSetStart,
  onSetGoal,
  routePoints,
  plannedRoute,
  onMapClick,
  sosAlerts = [],  // Accept SOS alerts
  selectedCCTVMarker = null,  // Selected CCTV to show marker
  selectedCCTV = null,  // Currently selected CCTV for filtering
  onCCTVSelect,  // Handle CCTV selection
  cctvData = [],  // CCTV data to display
  showCCTVMarkers = false,  // Toggle CCTV markers visibility
  lidarData = [],  // LiDAR data to display
  showLiDARMarkers = false,  // Toggle LiDAR markers visibility
  onLiDARSelect,  // Handle LiDAR selection
  onShipSelect    // Handle ship selection from marker click (optional)
}) => {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const markersRef = useRef({});
  const cctvMarkersRef = useRef({});  // Store CCTV markers
  const [mapLoaded, setMapLoaded] = useState(false);
  const clickHandlerRef = useRef(null);
  const tempMarkerRef = useRef(null);

  // Pohang area bounds for proper map centering
  const MAP_BOUNDS = {
    topLeft: { lat: 36.10, lng: 129.30 },
    bottomRight: { lat: 35.90, lng: 129.50 }
  };

  // Pixel dimensions for the coordinate system (matching backend)
  const PIXEL_WIDTH = 500;
  const PIXEL_HEIGHT = 350;

  // Convert pixel coordinates to lat/lng (still needed for route points)
  const pixelToLatLng = useCallback((x, y) => {
    const latRange = MAP_BOUNDS.topLeft.lat - MAP_BOUNDS.bottomRight.lat;
    const lngRange = MAP_BOUNDS.bottomRight.lng - MAP_BOUNDS.topLeft.lng;

    // For route planning, use 500x350 canvas dimensions
    const lat = MAP_BOUNDS.topLeft.lat - (y / PIXEL_HEIGHT) * latRange;
    const lng = MAP_BOUNDS.topLeft.lng + (x / PIXEL_WIDTH) * lngRange;

    return { lat, lng };
  }, []);

  // Convert lat/lng to pixel coordinates
  // Reverse of pixelToLatLng function
  const latLngToPixel = useCallback((lat, lng) => {
    const latRange = MAP_BOUNDS.topLeft.lat - MAP_BOUNDS.bottomRight.lat;
    const lngRange = MAP_BOUNDS.bottomRight.lng - MAP_BOUNDS.topLeft.lng;

    // Convert lat/lng back to pixel coordinates (0-500, 0-350)
    const x = ((lng - MAP_BOUNDS.topLeft.lng) / lngRange) * PIXEL_WIDTH;
    const y = ((MAP_BOUNDS.topLeft.lat - lat) / latRange) * PIXEL_HEIGHT;

    return { x, y };
  }, []);



  // Initialize map
  useEffect(() => {
    if (map.current) return; // initialize only once

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12', // satellite view with streets
      center: [129.55, 35.985], // Pohang Guryongpo port center
      zoom: 14, // Good zoom level for port area
      minZoom: 10, // Don't zoom out too much
      maxZoom: 18 // Allow good detail zoom
    });

    map.current.on('load', () => {
      setMapLoaded(true);

      // Don't auto-fit bounds - let user navigate freely
      // Just add navigation controls
      map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

      // Corner markers removed for cleaner interface
      // Previously showed top-left and bottom-right corner positions

      // Initialize click handler
      clickHandlerRef.current = (e) => {
        console.log('Map clicked at:', e.lngLat, 'onMapClick:', typeof onMapClick);

        // Add temporary marker at click location
        if (tempMarkerRef.current) {
          tempMarkerRef.current.remove();
          tempMarkerRef.current = null;
        }

        // Handle ship position click mode
        if (onMapClick && typeof onMapClick === 'function') {
          console.log('Calling onMapClick with:', e.lngLat.lat, e.lngLat.lng);

          // Create temporary marker
          const el = document.createElement('div');
          el.style.width = '20px';
          el.style.height = '20px';
          el.style.backgroundColor = '#ffc107';
          el.style.border = '3px solid white';
          el.style.borderRadius = '50%';
          el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';

          tempMarkerRef.current = new mapboxgl.Marker(el)
            .setLngLat([e.lngLat.lng, e.lngLat.lat])
            .addTo(map.current);

          onMapClick(e.lngLat.lat, e.lngLat.lng);
        }
        // Handle route planning click mode
        else if (onSetStart || onSetGoal) {
          const pixel = latLngToPixel(e.lngLat.lat, e.lngLat.lng);
          console.log('Route planning click at:', pixel, 'LatLng:', e.lngLat);
        }
      };

      map.current.on('click', clickHandlerRef.current);
    });

    return () => {
      if (map.current) {
        if (clickHandlerRef.current) {
          map.current.off('click', clickHandlerRef.current);
        }
        map.current.remove();
        map.current = null;
      }
    };
  }, [latLngToPixel]);

  // Update click handler when onMapClick changes
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    // Update cursor style based on click mode
    if (onMapClick && typeof onMapClick === 'function') {
      map.current.getCanvas().style.cursor = 'crosshair';
    } else {
      map.current.getCanvas().style.cursor = '';
    }

    // Remove old handler
    if (clickHandlerRef.current) {
      map.current.off('click', clickHandlerRef.current);
    }

    // Add new handler
    clickHandlerRef.current = (e) => {
      console.log('Map clicked (updated handler) at:', e.lngLat, 'onMapClick:', typeof onMapClick);

      // Remove previous temporary marker
      if (tempMarkerRef.current) {
        tempMarkerRef.current.remove();
        tempMarkerRef.current = null;
      }

      // Handle ship position click mode
      if (onMapClick && typeof onMapClick === 'function') {
        console.log('Calling onMapClick with:', e.lngLat.lat, e.lngLat.lng);

        // Create temporary marker to show click location
        const el = document.createElement('div');
        el.style.width = '20px';
        el.style.height = '20px';
        el.style.backgroundColor = '#ffc107';
        el.style.border = '3px solid white';
        el.style.borderRadius = '50%';
        el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';

        tempMarkerRef.current = new mapboxgl.Marker(el)
          .setLngLat([e.lngLat.lng, e.lngLat.lat])
          .addTo(map.current);

        onMapClick(e.lngLat.lat, e.lngLat.lng);
      }
      // Handle route planning click mode
      else if (onSetStart || onSetGoal) {
        const pixel = latLngToPixel(e.lngLat.lat, e.lngLat.lng);
        console.log('Route planning click at:', pixel, 'LatLng:', e.lngLat);
      }
      // Test mode - add permanent test markers when no other mode is active
      else {
        console.log('🔵 Test mode click - creating marker at:', e.lngLat);

        // Create test marker element with bright colors
        const testEl = document.createElement('div');
        testEl.style.width = '40px';
        testEl.style.height = '40px';
        testEl.style.borderRadius = '50%';
        testEl.style.backgroundColor = '#ff00ff';
        testEl.style.border = '4px solid yellow';
        testEl.style.boxShadow = '0 0 20px rgba(255, 0, 255, 1)';
        testEl.style.position = 'absolute';
        testEl.style.zIndex = '5000';
        testEl.style.display = 'flex';
        testEl.style.alignItems = 'center';
        testEl.style.justifyContent = 'center';
        testEl.style.cursor = 'pointer';
        testEl.innerHTML = '<span style="color: white; font-size: 20px; font-weight: bold;">T</span>';

        // Create and add the test marker with high z-index
        const testMarker = new mapboxgl.Marker({
          element: testEl,
          anchor: 'center'
        })
          .setLngLat([e.lngLat.lng, e.lngLat.lat])
          .addTo(map.current);

        // Add popup with coordinates
        const popup = new mapboxgl.Popup({ offset: 25 })
          .setHTML(`
            <div style="padding: 8px; background: white;">
              <strong style="color: #ff00ff;">테스트 마커</strong><br/>
              <strong>위도:</strong> ${e.lngLat.lat.toFixed(6)}<br/>
              <strong>경도:</strong> ${e.lngLat.lng.toFixed(6)}<br/>
              <small>클릭하여 팝업 표시</small>
            </div>
          `);
        testMarker.setPopup(popup);
        popup.addTo(map.current); // Show popup immediately

        console.log('✅ Test marker successfully added at:', {
          lat: e.lngLat.lat,
          lng: e.lngLat.lng,
          marker: testMarker
        });
      }
    };

    map.current.on('click', clickHandlerRef.current);

    // Clear temporary marker when click handler changes
    return () => {
      if (tempMarkerRef.current) {
        tempMarkerRef.current.remove();
        tempMarkerRef.current = null;
      }
    };
  }, [onMapClick, onSetStart, onSetGoal, mapLoaded, latLngToPixel]);

  // Update ship markers
  useEffect(() => {
    if (!mapLoaded || !map.current) return;

    // Remove old ship markers (but preserve special markers like fishing-area and docking-position)
    Object.entries(markersRef.current).forEach(([key, marker]) => {
      if (key !== 'fishing-area' && key !== 'docking-position') {
        marker.remove();
        delete markersRef.current[key];
      }
    });

    // Add ship markers
    ships.forEach(ship => {
      // Handle both formats: {latitude, longitude} and {lati, longi}
      const lat = ship.latitude || ship.lati;
      const lng = ship.longitude || ship.longi;

      if (lat && lng) {
        // Create custom marker element
        const el = document.createElement('div');
        el.className = 'ship-marker';

        // Handle different ID fields - convert to string for comparison
        const shipId = String(ship.shipId || ship.devId || ship.id);
        const selectedId = String(selectedShip?.shipId || selectedShip?.devId || selectedShip?.id || '');
        const isSelected = shipId && selectedId && shipId === selectedId;

        // Make selected ship marker larger and more visible
        el.style.width = isSelected ? '30px' : '20px';
        el.style.height = isSelected ? '30px' : '20px';
        el.style.borderRadius = '50%';
        el.style.backgroundColor = isSelected ? '#ff0000' : '#00ff00';
        el.style.boxShadow = isSelected ? '0 0 20px #ff0000' : '0 0 5px rgba(0,255,0,0.5)';
        el.style.border = isSelected ? '3px solid white' : '2px solid white';
        el.style.cursor = 'pointer';
        el.style.zIndex = isSelected ? '1000' : '100';

        // Add popup
        const popup = new mapboxgl.Popup({ offset: 25 })
          .setHTML(`
            <div style="padding: 5px;">
              <strong>${ship.name || `선박 ${shipId}`}</strong><br/>
              속도: ${ship.speed || 0} knots<br/>
              방향: ${ship.course || 0}°
            </div>
          `);

        const marker = new mapboxgl.Marker(el)
          .setLngLat([lng, lat])
          .setPopup(popup)
          .addTo(map.current);

        markersRef.current[shipId] = marker;

        // Allow clicking the marker to select the ship in UI (if parent provided handler)
        el.addEventListener('click', () => {
          try {
            // Trigger a custom event on window with marker ship identity
            const event = new CustomEvent('map-ship-marker-click', { detail: { shipId: ship.shipId, devId: ship.devId, id: ship.id } });
            window.dispatchEvent(event);
            // Also call provided handler directly if available
            if (typeof onShipSelect === 'function') {
              onShipSelect({ shipId: ship.shipId, devId: ship.devId, id: ship.id });
            }
          } catch (e) {
            console.warn('Failed to dispatch marker click event:', e);
          }
        });
      }
    });
  }, [ships, selectedShip, mapLoaded]);

  // Display SOS alerts on the map
  useEffect(() => {
    if (!mapLoaded || !map.current) return;

    // Remove old SOS markers
    Object.entries(markersRef.current).forEach(([key, marker]) => {
      if (key.startsWith('sos-')) {
        marker.remove();
        delete markersRef.current[key];
      }
    });

    // Add SOS alert markers
    sosAlerts.forEach(alert => {
      if (alert.latitude && alert.longitude && alert.status === 'active') {
        // Create custom SOS marker element with blinking animation
        const el = document.createElement('div');
        el.className = 'sos-marker';
        el.style.width = '40px';
        el.style.height = '40px';
        el.style.borderRadius = '50%';
        el.style.backgroundColor = '#ff0000';
        el.style.border = '4px solid white';
        el.style.boxShadow = '0 0 20px rgba(255, 0, 0, 0.8)';
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'center';
        el.style.cursor = 'pointer';
        el.style.zIndex = '2000';
        el.innerHTML = '<span style="color: white; font-size: 24px; font-weight: bold;">🆘</span>';

        // Add blinking animation
        el.style.animation = 'blink 1s infinite';

        // Add CSS animation if not already added
        if (!document.querySelector('#sos-blink-style')) {
          const style = document.createElement('style');
          style.id = 'sos-blink-style';
          style.innerHTML = `
            @keyframes blink {
              0% { opacity: 1; transform: scale(1); }
              50% { opacity: 0.6; transform: scale(1.1); }
              100% { opacity: 1; transform: scale(1); }
            }
          `;
          document.head.appendChild(style);
        }

        // Create popup with SOS details
        const popup = new mapboxgl.Popup({ offset: 25 })
          .setHTML(`
            <div style="padding: 10px; min-width: 200px;">
              <h3 style="margin: 0 0 10px; color: #ff0000;">🆘 긴급 신호</h3>
              <p style="margin: 5px 0;"><strong>선박:</strong> ${alert.ship_name || alert.ship_id}</p>
              <p style="margin: 5px 0;"><strong>유형:</strong> ${
                alert.emergency_type === 'collision' ? '충돌 위험' :
                alert.emergency_type === 'fire' ? '화재' :
                alert.emergency_type === 'engine' ? '엔진 고장' :
                alert.emergency_type === 'medical' ? '의료 응급' :
                alert.emergency_type
              }</p>
              <p style="margin: 5px 0;"><strong>메시지:</strong> ${alert.message}</p>
              <p style="margin: 5px 0;"><strong>위치:</strong> ${alert.latitude.toFixed(4)}, ${alert.longitude.toFixed(4)}</p>
              <p style="margin: 5px 0; color: #666;"><strong>시각:</strong> ${new Date(alert.created_at).toLocaleString('ko-KR')}</p>
            </div>
          `);

        const marker = new mapboxgl.Marker(el)
          .setLngLat([alert.longitude, alert.latitude])
          .setPopup(popup)
          .addTo(map.current);

        markersRef.current[`sos-${alert.id}`] = marker;
      }
    });
  }, [sosAlerts, mapLoaded]);

  // Helper function to create sensor marker element
  const createSensorMarkerElement = (type, sensor) => {
    const el = document.createElement('div');
    el.className = type === 'cctv' ? 'cctv-marker' : 'lidar-marker';
    el.style.width = '30px';
    el.style.height = '30px';
    el.style.borderRadius = '50%'; // 원형으로 변경
    el.style.backgroundColor = type === 'cctv' ? '#4169E1' : '#9b59b6';  // Blue for CCTV, Purple for LiDAR
    el.style.border = '2px solid white';
    el.style.boxShadow = type === 'cctv'
      ? '0 0 10px rgba(65, 105, 225, 0.5)'
      : '0 0 10px rgba(155, 89, 182, 0.5)';
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    el.style.cursor = 'pointer';
    el.style.fontSize = '16px';
    el.style.position = 'relative';
    el.style.transition = 'all 0.2s ease';
    el.innerHTML = type === 'cctv' ? '📹' : '📡';

    // Add hover effect without transform
    el.onmouseenter = () => {
      el.style.width = '33px';
      el.style.height = '33px';
      el.style.fontSize = '18px';
      el.style.boxShadow = type === 'cctv'
        ? '0 0 15px rgba(65, 105, 225, 0.8)'
        : '0 0 15px rgba(155, 89, 182, 0.8)';
      el.style.borderWidth = '3px';
    };
    el.onmouseleave = () => {
      el.style.width = '30px';
      el.style.height = '30px';
      el.style.fontSize = '16px';
      el.style.boxShadow = type === 'cctv'
        ? '0 0 10px rgba(65, 105, 225, 0.5)'
        : '0 0 10px rgba(155, 89, 182, 0.5)';
      el.style.borderWidth = '2px';
    };

    // Handle click for CCTV video
    if (type === 'cctv') {
      el.onclick = () => {
        if (onCCTVSelect) {
          onCCTVSelect(sensor);
        }
      };
    }

    return el;
  };

  // Helper function to create sensor popup
  const createSensorPopup = (type, sensor) => {
    const color = type === 'cctv' ? '#4169E1' : '#9b59b6';
    const icon = type === 'cctv' ? '📹' : '📡';
    const typeName = type === 'cctv' ? 'CCTV' : 'LiDAR';

    return new mapboxgl.Popup({ offset: 25 })
      .setHTML(`
        <div style="padding: 10px; min-width: 200px;">
          <h3 style="margin: 0 0 10px; color: ${color};">${icon} ${typeName}</h3>
          <p style="margin: 5px 0;"><strong>이름:</strong> ${sensor.name}</p>
          <p style="margin: 5px 0;"><strong>주소:</strong> ${sensor.address || '정보 없음'}</p>
          <p style="margin: 5px 0;"><strong>상태:</strong> <span style="color: #00ff00;">● 작동중</span></p>
          ${type === 'cctv' ? '<p style="margin: 10px 0 0; color: #666; font-size: 12px;">클릭하여 실시간 영상 보기</p>' : ''}
        </div>
      `);
  };

  // Update CCTV and LiDAR markers
  useEffect(() => {
    if (!mapLoaded || !map.current) return;

    // Remove old CCTV and LiDAR markers
    Object.entries(cctvMarkersRef.current).forEach(([key, marker]) => {
      marker.remove();
      delete cctvMarkersRef.current[key];
    });

    // Handle sensor markers based on type
    if (selectedCCTVMarker) {
      if (selectedCCTVMarker.type === 'cctv-all') {
        // Show all CCTV markers
        console.log('Adding all CCTV markers:', selectedCCTVMarker.markers?.length);
        selectedCCTVMarker.markers?.forEach(cctv => {
          const el = createSensorMarkerElement('cctv', cctv);

          const lng = parseFloat(cctv.lng || cctv.longitude);
          const lat = parseFloat(cctv.lat || cctv.latitude);

          const marker = new mapboxgl.Marker(el)
            .setLngLat([lng, lat])
            .setPopup(createSensorPopup('cctv', cctv))
            .addTo(map.current);

          cctvMarkersRef.current[`cctv-${cctv.id}`] = marker;
        });

        // Fit map to show all markers
        if (selectedCCTVMarker.markers?.length > 0) {
          const bounds = new mapboxgl.LngLatBounds();
          selectedCCTVMarker.markers.forEach(cctv => {
            const lng = parseFloat(cctv.lng || cctv.longitude);
            const lat = parseFloat(cctv.lat || cctv.latitude);
            bounds.extend([lng, lat]);
          });
          map.current.fitBounds(bounds, { padding: 50, duration: 1500 });
        }
      } else if (selectedCCTVMarker.type === 'cctv-single') {
        // Show single CCTV marker
        console.log('Adding single CCTV marker:', selectedCCTVMarker.marker);
        const cctv = selectedCCTVMarker.marker;
        const el = createSensorMarkerElement('cctv', cctv);

        const lng = parseFloat(cctv.lng || cctv.longitude);
        const lat = parseFloat(cctv.lat || cctv.latitude);

        const marker = new mapboxgl.Marker(el)
          .setLngLat([lng, lat])
          .setPopup(createSensorPopup('cctv', cctv))
          .addTo(map.current);

        cctvMarkersRef.current[`cctv-${cctv.id}`] = marker;

        // Zoom to single marker
        map.current.flyTo({
          center: [lng, lat],
          zoom: 15,
          duration: 1500
        });
      } else if (selectedCCTVMarker.type === 'lidar-all') {
        // Show all LiDAR markers
        console.log('Adding all LiDAR markers:', selectedCCTVMarker.markers?.length);
        selectedCCTVMarker.markers?.forEach(lidar => {
          const el = createSensorMarkerElement('lidar', lidar);

          const lng = parseFloat(lidar.lng || lidar.longitude);
          const lat = parseFloat(lidar.lat || lidar.latitude);

          const marker = new mapboxgl.Marker(el)
            .setLngLat([lng, lat])
            .setPopup(createSensorPopup('lidar', lidar))
            .addTo(map.current);

          cctvMarkersRef.current[`lidar-${lidar.id}`] = marker;
        });

        // Fit map to show all markers
        if (selectedCCTVMarker.markers?.length > 0) {
          const bounds = new mapboxgl.LngLatBounds();
          selectedCCTVMarker.markers.forEach(lidar => {
            const lng = parseFloat(lidar.lng || lidar.longitude);
            const lat = parseFloat(lidar.lat || lidar.latitude);
            bounds.extend([lng, lat]);
          });
          map.current.fitBounds(bounds, { padding: 50, duration: 1500 });
        }
      } else if (selectedCCTVMarker.type === 'lidar-single') {
        // Show single LiDAR marker
        console.log('Adding single LiDAR marker:', selectedCCTVMarker.marker);
        const lidar = selectedCCTVMarker.marker;
        const el = createSensorMarkerElement('lidar', lidar);

        const lng = parseFloat(lidar.lng || lidar.longitude);
        const lat = parseFloat(lidar.lat || lidar.latitude);

        const marker = new mapboxgl.Marker(el)
          .setLngLat([lng, lat])
          .setPopup(createSensorPopup('lidar', lidar))
          .addTo(map.current);

        cctvMarkersRef.current[`lidar-${lidar.id}`] = marker;

        // Zoom to single marker
        map.current.flyTo({
          center: [lng, lat],
          zoom: 15,
          duration: 1500
        });
      } else if (selectedCCTVMarker.type === 'clear') {
        // Clear all markers - already removed above
        console.log('Cleared all sensor markers');
      }
    }
  }, [selectedCCTVMarker, mapLoaded, onCCTVSelect]);

  // Update fishing area and docking position markers for selected ship
  useEffect(() => {
    if (!mapLoaded || !map.current) {
      console.log('Map not ready for position markers:', { mapLoaded, hasMap: !!map.current });
      return;
    }

    // Remove old fishing/docking markers
    if (markersRef.current['fishing-area']) {
      markersRef.current['fishing-area'].remove();
      delete markersRef.current['fishing-area'];
    }
    if (markersRef.current['docking-position']) {
      markersRef.current['docking-position'].remove();
      delete markersRef.current['docking-position'];
    }

    // Add fishing area and docking position markers for selected ship
    if (selectedShip) {
      console.log('✅ Adding position markers for selected ship:', {
        shipId: selectedShip.shipId,
        name: selectedShip.name,
        type: selectedShip.type,
        fishing: { lat: selectedShip.fishingAreaLat, lng: selectedShip.fishingAreaLng },
        docking: { lat: selectedShip.dockingLat, lng: selectedShip.dockingLng }
      });

      // Fishing area (if exists) - Show for all ships, not just fishing vessels
      if (selectedShip.fishingAreaLat && selectedShip.fishingAreaLng) {
        const fishingEl = document.createElement('div');
        fishingEl.className = 'fishing-area-marker';
        fishingEl.style.width = '40px';
        fishingEl.style.height = '40px';
        fishingEl.style.borderRadius = '50%';
        fishingEl.style.backgroundColor = '#3498db';
        fishingEl.style.border = '4px solid white';
        fishingEl.style.boxShadow = '0 0 10px rgba(52, 152, 219, 0.8)';
        fishingEl.style.display = 'flex';
        fishingEl.style.alignItems = 'center';
        fishingEl.style.justifyContent = 'center';
        fishingEl.style.position = 'absolute';
        fishingEl.style.zIndex = '1000';
        fishingEl.style.cursor = 'pointer';
        fishingEl.innerHTML = '<span style="color: white; font-size: 20px; font-weight: bold;">⚓</span>';

        // Create marker with custom options
        const fishingMarker = new mapboxgl.Marker({
          element: fishingEl,
          anchor: 'center'
        })
          .setLngLat([selectedShip.fishingAreaLng, selectedShip.fishingAreaLat])
          .addTo(map.current);

        // Add popup for fishing area
        const fishingPopup = new mapboxgl.Popup({ offset: 25 })
          .setText(`${selectedShip.name} - 어장 위치`);
        fishingMarker.setPopup(fishingPopup);

        markersRef.current['fishing-area'] = fishingMarker;
        console.log('✅ Fishing area marker added at:', selectedShip.fishingAreaLng, selectedShip.fishingAreaLat);
      }

      // Docking position (if exists)
      if (selectedShip.dockingLat && selectedShip.dockingLng) {
        const dockingEl = document.createElement('div');
        dockingEl.className = 'docking-position-marker';
        dockingEl.style.width = '40px';
        dockingEl.style.height = '40px';
        dockingEl.style.borderRadius = '50%';
        dockingEl.style.backgroundColor = '#2ecc71';
        dockingEl.style.border = '4px solid white';
        dockingEl.style.boxShadow = '0 0 10px rgba(46, 204, 113, 0.8)';
        dockingEl.style.display = 'flex';
        dockingEl.style.alignItems = 'center';
        dockingEl.style.justifyContent = 'center';
        dockingEl.style.position = 'absolute';
        dockingEl.style.zIndex = '1000';
        dockingEl.style.cursor = 'pointer';
        dockingEl.innerHTML = '<span style="color: white; font-size: 20px; font-weight: bold;">🚢</span>';

        // Create marker with custom options
        const dockingMarker = new mapboxgl.Marker({
          element: dockingEl,
          anchor: 'center'
        })
          .setLngLat([selectedShip.dockingLng, selectedShip.dockingLat])
          .addTo(map.current);

        // Add popup for docking position
        const dockingPopup = new mapboxgl.Popup({ offset: 25 })
          .setText(`${selectedShip.name} - 정박 위치`);
        dockingMarker.setPopup(dockingPopup);

        markersRef.current['docking-position'] = dockingMarker;
        console.log('✅ Docking position marker added at:', selectedShip.dockingLng, selectedShip.dockingLat);
      }

      // Fit the map to show both markers if they exist
      if ((selectedShip.fishingAreaLat && selectedShip.fishingAreaLng) ||
          (selectedShip.dockingLat && selectedShip.dockingLng)) {
        const bounds = new mapboxgl.LngLatBounds();

        if (selectedShip.fishingAreaLat && selectedShip.fishingAreaLng) {
          bounds.extend([selectedShip.fishingAreaLng, selectedShip.fishingAreaLat]);
        }
        if (selectedShip.dockingLat && selectedShip.dockingLng) {
          bounds.extend([selectedShip.dockingLng, selectedShip.dockingLat]);
        }

        // If only one position exists, add a small offset to create bounds
        const boundsArray = bounds.toArray();
        if (boundsArray[0][0] === boundsArray[1][0] && boundsArray[0][1] === boundsArray[1][1]) {
          // Single point, add small offset
          bounds.extend([boundsArray[0][0] - 0.01, boundsArray[0][1] - 0.01]);
          bounds.extend([boundsArray[0][0] + 0.01, boundsArray[0][1] + 0.01]);
        }

        map.current.fitBounds(bounds, {
          padding: 100,
          duration: 2000,
          maxZoom: 15
        });
      }
    } else {
      console.log('❌ No selected ship for position markers');
    }
  }, [selectedShip, mapLoaded]);

  // Draw routes
  useEffect(() => {
    if (!mapLoaded || !map.current) return;

    // Remove existing route layers
    if (map.current.getLayer('planned-route')) {
      map.current.removeLayer('planned-route');
      map.current.removeSource('planned-route');
    }

    if (plannedRoute && plannedRoute.path_points && plannedRoute.path_points.length > 0) {
      // path_points are already in lat/lng format from backend
      const coordinates = plannedRoute.path_points.map(point => {
        // Backend sends [lat, lng], Mapbox expects [lng, lat]
        return [point[1], point[0]];
      });

      // Add route source and layer
      map.current.addSource('planned-route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: coordinates
          }
        }
      });

      map.current.addLayer({
        id: 'planned-route',
        type: 'line',
        source: 'planned-route',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#ffff00',
          'line-width': 3,
          'line-opacity': 0.8
        }
      });
    }
  }, [plannedRoute, mapLoaded, pixelToLatLng]);


  // Draw start and goal points
  useEffect(() => {
    if (!mapLoaded || !map.current) return;

    // Remove existing markers
    if (markersRef.current['start']) {
      markersRef.current['start'].remove();
      delete markersRef.current['start'];
    }
    if (markersRef.current['goal']) {
      markersRef.current['goal'].remove();
      delete markersRef.current['goal'];
    }

    // Add start marker
    if (routePoints.start) {
      const startLatLng = pixelToLatLng(routePoints.start[0], routePoints.start[1]);

      const startEl = document.createElement('div');
      startEl.innerHTML = '🚩';
      startEl.style.fontSize = '30px';

      const startMarker = new mapboxgl.Marker(startEl)
        .setLngLat([startLatLng.lng, startLatLng.lat])
        .addTo(map.current);

      markersRef.current['start'] = startMarker;
    }

    // Add goal marker
    if (routePoints.goal) {
      const goalLatLng = pixelToLatLng(routePoints.goal[0], routePoints.goal[1]);

      const goalEl = document.createElement('div');
      goalEl.innerHTML = '🎯';
      goalEl.style.fontSize = '30px';

      const goalMarker = new mapboxgl.Marker(goalEl)
        .setLngLat([goalLatLng.lng, goalLatLng.lat])
        .addTo(map.current);

      markersRef.current['goal'] = goalMarker;
    }
  }, [routePoints, mapLoaded, pixelToLatLng]);

  // Draw obstacles
  useEffect(() => {
    if (!mapLoaded || !map.current) return;

    // Wait a bit for map to be fully ready
    const timer = setTimeout(() => {
      if (!map.current) return;

      // Remove existing obstacle layers
      if (map.current.getLayer('obstacles-outline')) {
        map.current.removeLayer('obstacles-outline');
      }
      if (map.current.getLayer('obstacles')) {
        map.current.removeLayer('obstacles');
      }
      if (map.current.getSource('obstacles')) {
        map.current.removeSource('obstacles');
      }

      if (obstacles && obstacles.length > 0) {
      console.log('Drawing obstacles:', obstacles.length, 'obstacles');
      console.log('First obstacle:', obstacles[0]);

      const features = obstacles.map((obstacle, index) => {
        // Use pre-converted lat/lng coordinates directly
        // coordinates are already in [lat, lng] format, need to swap to [lng, lat] for Mapbox
        const coordinates = obstacle.coordinates.map(coord => {
          return [coord[1], coord[0]];  // Swap to [lng, lat] for Mapbox
        });

        // Close the polygon
        if (coordinates.length > 0) {
          coordinates.push(coordinates[0]);
        }

        return {
          type: 'Feature',
          properties: { id: index },
          geometry: {
            type: 'Polygon',
            coordinates: [coordinates]
          }
        };
      });

      map.current.addSource('obstacles', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: features
        }
      });

      map.current.addLayer({
        id: 'obstacles',
        type: 'fill',
        source: 'obstacles',
        paint: {
          'fill-color': '#ff0000', // Red color for obstacles
          'fill-opacity': 0.5
        }
      });

      // Add obstacle outlines
      map.current.addLayer({
        id: 'obstacles-outline',
        type: 'line',
        source: 'obstacles',
        paint: {
          'line-color': '#8b0000', // Dark red for outlines
          'line-width': 3
        }
      });
      }
    }, 100); // Small delay to ensure map is ready

    return () => clearTimeout(timer);
  }, [obstacles, mapLoaded, pixelToLatLng]);

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: '100%',
      borderRadius: '8px',
      overflow: 'hidden'
    }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

      {/* CCTV Markers */}
      {mapLoaded && showCCTVMarkers && (
        <CCTVMarkerManager
          map={map.current}
          cctvData={cctvData}
          onCCTVSelect={onCCTVSelect}
          selectedCCTV={selectedCCTV}
        />
      )}

      {/* LiDAR Markers */}
      {mapLoaded && showLiDARMarkers && (
        <LiDARMarkerManager
          map={map.current}
          lidarData={lidarData}
          onLiDARSelect={onLiDARSelect}
        />
      )}

      {/* Legend */}
      <div style={{
        position: 'absolute',
        bottom: '10px',
        right: '10px',
        background: 'rgba(0, 0, 0, 0.7)',
        color: 'white',
        padding: '10px',
        borderRadius: '4px',
        fontSize: '12px'
      }}>
        <div style={{ marginBottom: '5px' }}>
          <span style={{
            display: 'inline-block',
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            backgroundColor: '#00ff00',
            marginRight: '5px'
          }} />
          일반 선박
        </div>
        <div style={{ marginBottom: '5px' }}>
          <span style={{
            display: 'inline-block',
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            backgroundColor: '#ff0000',
            marginRight: '5px'
          }} />
          선택된 선박
        </div>
        <div style={{ marginBottom: '5px' }}>
          <span style={{
            display: 'inline-block',
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            backgroundColor: '#3498db',
            marginRight: '5px'
          }} />
          어장 위치
        </div>
        <div>
          <span style={{
            display: 'inline-block',
            width: '12px',
            height: '12px',
            backgroundColor: '#2ecc71',
            marginRight: '5px'
          }} />
          정박 위치
        </div>
      </div>
    </div>
  );
};

export default MapViewReal;