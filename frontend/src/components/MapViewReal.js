import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  onShipSelect,    // Handle ship selection from marker click (optional)
  isSimulationRunning = false,  // Whether simulation is active
  simulationRoutes = [],  // Routes for simulation display
  selectedShipRoute = null,  // Selected ship's route to display
  showDensityHeatmap = false  // Show ship density heatmap
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

  // Haversine distance calculation (in meters)
  const calculateDistance = useCallback((lat1, lng1, lat2, lng2) => {
    const R = 6371000; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lng2 - lng1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }, []);

  // Calculate ship clusters for density visualization
  const calculateShipClusters = useCallback((ships) => {
    const clusters = [];
    const processed = new Set();
    const maxDistance = 500; // 500 meters radius for clustering

    console.log('Calculating clusters for', ships.length, 'ships');

    ships.forEach((ship, index) => {
      // Handle both formats: {latitude, longitude} and {lati, longi}
      const lat = ship.latitude || ship.lati;
      const lng = ship.longitude || ship.longi;

      if (!lat || !lng || processed.has(index)) return;

      const cluster = {
        ships: [ship],
        indices: [index],
        center: { lat, lng }
      };

      // Find all nearby ships for this cluster
      ships.forEach((otherShip, otherIndex) => {
        if (index === otherIndex || processed.has(otherIndex)) return;

        // Handle both formats for other ships too
        const otherLat = otherShip.latitude || otherShip.lati;
        const otherLng = otherShip.longitude || otherShip.longi;

        if (!otherLat || !otherLng) return;

        const distance = calculateDistance(
          cluster.center.lat,
          cluster.center.lng,
          otherLat,
          otherLng
        );

        if (distance < maxDistance) {
          cluster.ships.push(otherShip);
          cluster.indices.push(otherIndex);
          processed.add(otherIndex);
        }
      });

      if (cluster.ships.length >= 1) {
        // Update cluster center (centroid)
        const totalLat = cluster.ships.reduce((sum, s) => sum + (s.latitude || s.lati || 0), 0);
        const totalLng = cluster.ships.reduce((sum, s) => sum + (s.longitude || s.longi || 0), 0);
        cluster.center.lat = totalLat / cluster.ships.length;
        cluster.center.lng = totalLng / cluster.ships.length;

        // Calculate cluster radius based on ship count and distribution
        if (cluster.ships.length === 1) {
          // Single ship - small radius
          cluster.radius = 150;
        } else {
          // Multiple ships - calculate based on furthest ship
          let maxDist = 0;
          cluster.ships.forEach(s => {
            const shipLat = s.latitude || s.lati;
            const shipLng = s.longitude || s.longi;
            const dist = calculateDistance(
              cluster.center.lat,
              cluster.center.lng,
              shipLat,
              shipLng
            );
            maxDist = Math.max(maxDist, dist);
          });
          // Radius grows with more ships
          cluster.radius = Math.max(maxDist + (cluster.ships.length * 30), 200);
        }

        clusters.push(cluster);
        cluster.indices.forEach(idx => processed.add(idx));
      }
    });

    console.log('Created', clusters.length, 'clusters');
    return clusters;
  }, [calculateDistance]);

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

  // Update density clusters
  useEffect(() => {
    console.log('Density heatmap effect triggered. showDensityHeatmap:', showDensityHeatmap, 'mapLoaded:', mapLoaded, 'ships count:', ships?.length);

    if (!mapLoaded || !map.current) {
      console.log('Map not ready, skipping density visualization');
      return;
    }

    // Clean up existing layers
    if (map.current.getLayer('cluster-circles')) {
      map.current.removeLayer('cluster-circles');
    }
    if (map.current.getSource('ship-clusters')) {
      map.current.removeSource('ship-clusters');
    }

    if (!showDensityHeatmap) {
      console.log('Density heatmap disabled, cleaned up layers');
      return;
    }

    // Create density visualization using clusters
    console.log('DENSITY ENABLED - Creating cluster visualization');

    // Calculate clusters
    const clusters = calculateShipClusters(ships);
    console.log('Clusters created:', clusters);

    // Create GeoJSON for cluster circles with gradient colors
    const clusterFeatures = clusters.map(cluster => {
      // Calculate color based on ship count (blue -> green -> yellow -> red)
      let color;
      let strokeWidth;
      let opacity;
      const shipCount = cluster.ships.length;

      if (shipCount === 1) {
        // Single ship - blue, small
        color = 'rgba(0, 100, 255, 0.25)'; // Blue
        strokeWidth = 1;
        opacity = 0.6;
      } else if (shipCount === 2) {
        // 2 ships - cyan
        color = 'rgba(0, 200, 200, 0.3)'; // Cyan
        strokeWidth = 2;
        opacity = 0.65;
      } else if (shipCount === 3) {
        // 3 ships - green
        color = 'rgba(0, 255, 0, 0.35)'; // Green
        strokeWidth = 2;
        opacity = 0.7;
      } else if (shipCount === 4) {
        // 4 ships - yellow-green
        color = 'rgba(150, 255, 0, 0.4)'; // Yellow-green
        strokeWidth = 2.5;
        opacity = 0.75;
      } else if (shipCount === 5) {
        // 5 ships - yellow
        color = 'rgba(255, 255, 0, 0.45)'; // Yellow
        strokeWidth = 3;
        opacity = 0.8;
      } else if (shipCount === 6) {
        // 6 ships - orange
        color = 'rgba(255, 150, 0, 0.5)'; // Orange
        strokeWidth = 3;
        opacity = 0.85;
      } else {
        // 7+ ships - red
        color = 'rgba(255, 0, 0, 0.55)'; // Red
        strokeWidth = 4;
        opacity = 0.9;
      }

      console.log(`Cluster at [${cluster.center.lng}, ${cluster.center.lat}] with ${shipCount} ships, radius: ${cluster.radius}m, color: ${color}`);

      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [cluster.center.lng, cluster.center.lat]
        },
        properties: {
          radius: cluster.radius,
          shipCount: shipCount,
          color: color,
          borderColor: color.replace(/0\.\d+\)/, `${Math.min(opacity + 0.2, 1)})`), // Darker border
          strokeWidth: strokeWidth,
          opacity: opacity
        }
      };
    });

    // Use cluster features instead of individual ship circles
    const geoJsonData = {
      type: 'FeatureCollection',
      features: clusterFeatures
    };

    console.log('GeoJSON data:', geoJsonData);
    console.log('Features count:', geoJsonData.features.length);

    // Add or update source
    if (map.current.getSource('ship-clusters')) {
      console.log('Updating existing ship-clusters source');
      map.current.getSource('ship-clusters').setData(geoJsonData);
    } else {
      console.log('Adding new ship-clusters source');
      map.current.addSource('ship-clusters', {
        type: 'geojson',
        data: geoJsonData
      });
    }

    // Add cluster circles layer if it doesn't exist
    if (!map.current.getLayer('cluster-circles')) {
      console.log('Adding cluster-circles layer');

      // Try to add layer with proper ordering
      try {
        map.current.addLayer({
          id: 'cluster-circles',
          type: 'circle',
          source: 'ship-clusters',
          paint: {
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              10, ['/', ['get', 'radius'], 20],  // Scale based on actual radius
              12, ['/', ['get', 'radius'], 12],
              14, ['/', ['get', 'radius'], 6],
              16, ['/', ['get', 'radius'], 3],
              18, ['/', ['get', 'radius'], 1.5]
            ],
            'circle-color': ['get', 'color'],
            'circle-stroke-color': ['get', 'borderColor'],
            'circle-stroke-width': ['get', 'strokeWidth'],
            'circle-blur': 0.4,
            'circle-opacity': ['get', 'opacity']
          }
        });

        console.log('Successfully added cluster-circles layer');

        // Log the current style layers to debug ordering
        const layers = map.current.getStyle().layers;
        console.log('Current map layers:', layers.map(l => l.id));
      } catch (error) {
        console.error('Error adding cluster-circles layer:', error);
      }
    } else {
      console.log('cluster-circles layer already exists');
    }
  }, [ships, showDensityHeatmap, mapLoaded, calculateShipClusters]);

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
        el.style.backgroundColor = isSelected ? '#667eea' : '#7B68EE';
        el.style.boxShadow = isSelected ? '0 0 20px rgba(102, 126, 234, 0.8)' : '0 0 8px rgba(123, 104, 238, 0.4)';
        el.style.border = isSelected ? '3px solid white' : '2px solid rgba(255, 255, 255, 0.8)';
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
        el.style.backgroundColor = '#FF6B6B';
        el.style.border = '4px solid white';
        el.style.boxShadow = '0 0 20px rgba(255, 107, 107, 0.8)';
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
          <p style="margin: 5px 0;"><strong>상태:</strong> <span style="color: #4CAF50;">● 작동중</span></p>
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
        fishingEl.style.backgroundColor = '#87CEEB';
        fishingEl.style.border = '3px solid white';
        fishingEl.style.boxShadow = '0 0 15px rgba(135, 206, 235, 0.6)';
        fishingEl.style.display = 'flex';
        fishingEl.style.alignItems = 'center';
        fishingEl.style.justifyContent = 'center';
        fishingEl.style.position = 'absolute';
        fishingEl.style.zIndex = '1000';
        fishingEl.style.cursor = 'pointer';
        fishingEl.innerHTML = `
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C13.1 2 14 2.9 14 4C14 5.1 13.1 6 12 6C10.9 6 10 5.1 10 4C10 2.9 10.9 2 12 2Z" fill="white"/>
            <path d="M12 7L8 11H11V22H13V11H16L12 7Z" fill="white"/>
            <circle cx="12" cy="4" r="1.5" stroke="white" stroke-width="0.5" fill="rgba(255,255,255,0.3)"/>
          </svg>`;

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
        dockingEl.style.backgroundColor = '#4CAF50';
        dockingEl.style.border = '3px solid white';
        dockingEl.style.boxShadow = '0 0 15px rgba(76, 175, 80, 0.6)';
        dockingEl.style.display = 'flex';
        dockingEl.style.alignItems = 'center';
        dockingEl.style.justifyContent = 'center';
        dockingEl.style.position = 'absolute';
        dockingEl.style.zIndex = '1000';
        dockingEl.style.cursor = 'pointer';
        dockingEl.innerHTML = `
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M5 17H7V11H5V17ZM17 17H19V11H17V17ZM9 17H11V11H9V17ZM13 17H15V11H13V17Z" fill="white"/>
            <path d="M3 9L12 3L21 9V11H3V9Z" fill="white"/>
            <rect x="3" y="17" width="18" height="2" fill="white"/>
          </svg>`;

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

  // Memoize route coordinates to prevent unnecessary re-renders
  const routeCoordinates = useMemo(() => {
    if (routes && routes.length > 0 && routes[0].path) {
      return routes[0].path.map(point => [point[1], point[0]]);
    }
    return null;
  }, [routes]);

  // Draw selected ship route when available
  useEffect(() => {
    if (!mapLoaded || !map.current) return;

    const existingSource = map.current.getSource('selected-ship-route');
    const existingLayer = map.current.getLayer('selected-ship-route');

    if (!routeCoordinates) {
      // Remove layer if no route available
      if (existingLayer) {
        map.current.removeLayer('selected-ship-route');
      }
      if (existingSource) {
        map.current.removeSource('selected-ship-route');
      }
      return;
    }

    const geoJsonData = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: routeCoordinates
      }
    };

    // Update existing source if it exists, otherwise create new
    if (existingSource) {
      // Just update the data without removing/re-adding the layer
      existingSource.setData(geoJsonData);
    } else {
      // First time - add source and layer
      map.current.addSource('selected-ship-route', {
        type: 'geojson',
        data: geoJsonData
      });

      // Only add layer if it doesn't exist
      if (!existingLayer) {
        map.current.addLayer({
          id: 'selected-ship-route',
          type: 'line',
          source: 'selected-ship-route',
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': '#FFCC80',  // Pastel yellow-orange
            'line-width': 3,
            'line-opacity': 0.6,  // Semi-transparent
            'line-dasharray': [3, 3]  // Dotted line pattern [dash length, gap length]
          }
        });
        console.log('Created route layer for selected ship');
      }
    }
  }, [mapLoaded, routeCoordinates]);

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
          'fill-color': '#FF6B6B', // Soft red color for obstacles
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

    </div>
  );
};

export default MapViewReal;