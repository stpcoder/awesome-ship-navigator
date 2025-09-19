import React, { useState, useEffect, useRef, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

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
  onMapClick
}) => {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const markersRef = useRef({});
  const [mapLoaded, setMapLoaded] = useState(false);
  const clickHandlerRef = useRef(null);
  const tempMarkerRef = useRef(null);

  // Map bounds based on your specifications
  // Top-left: 35.993884, 129.546805
  // Bottom-right: 35.981355, 129.568345
  const MAP_BOUNDS = {
    topLeft: { lat: 35.993884, lng: 129.546805 },
    bottomRight: { lat: 35.981355, lng: 129.568345 }
  };

  // Convert pixel coordinates to lat/lng (still needed for route points)
  const pixelToLatLng = useCallback((x, y) => {
    const latRange = MAP_BOUNDS.topLeft.lat - MAP_BOUNDS.bottomRight.lat;
    const lngRange = MAP_BOUNDS.bottomRight.lng - MAP_BOUNDS.topLeft.lng;

    // For route planning, use 2000x1400 canvas dimensions
    const lat = MAP_BOUNDS.topLeft.lat - (y / 1400) * latRange;
    const lng = MAP_BOUNDS.topLeft.lng + (x / 2000) * lngRange;

    return { lat, lng };
  }, []);

  // Convert lat/lng to pixel coordinates
  // Reverse of pixelToLatLng function
  const latLngToPixel = useCallback((lat, lng) => {
    const latRange = MAP_BOUNDS.topLeft.lat - MAP_BOUNDS.bottomRight.lat;
    const lngRange = MAP_BOUNDS.bottomRight.lng - MAP_BOUNDS.topLeft.lng;

    // Convert lat/lng back to pixel coordinates (0-2000, 0-1400)
    const x = ((lng - MAP_BOUNDS.topLeft.lng) / lngRange) * 2000;
    const y = ((MAP_BOUNDS.topLeft.lat - lat) / latRange) * 1400;

    return { x, y };
  }, []);

  // Initialize map
  useEffect(() => {
    if (map.current) return; // initialize only once

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12', // satellite view with streets
      center: [
        (MAP_BOUNDS.topLeft.lng + MAP_BOUNDS.bottomRight.lng) / 2,
        (MAP_BOUNDS.topLeft.lat + MAP_BOUNDS.bottomRight.lat) / 2
      ],
      zoom: 16, // Initial zoom level
      minZoom: 3, // Allow zooming out to see whole world
      maxZoom: 22 // Allow maximum zoom in
    });

    map.current.on('load', () => {
      setMapLoaded(true);

      // Fit the map to the exact bounds with no padding to ensure corners match
      map.current.fitBounds([
        [MAP_BOUNDS.topLeft.lng, MAP_BOUNDS.topLeft.lat],  // Northwest corner
        [MAP_BOUNDS.bottomRight.lng, MAP_BOUNDS.bottomRight.lat]  // Southeast corner
      ], {
        padding: 0,  // No padding to ensure exact fit
        animate: false,
        linear: true
      });

      // Add navigation controls
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
      if (ship.latitude && ship.longitude) {
        // Create custom marker element
        const el = document.createElement('div');
        el.className = 'ship-marker';
        el.style.width = '20px';
        el.style.height = '20px';
        el.style.borderRadius = '50%';
        el.style.backgroundColor = ship.shipId === selectedShip?.shipId ? '#ff0000' : '#00ff00';
        el.style.border = '2px solid white';
        el.style.cursor = 'pointer';

        // Add popup
        const popup = new mapboxgl.Popup({ offset: 25 })
          .setHTML(`
            <div style="padding: 5px;">
              <strong>${ship.name || ship.shipId}</strong><br/>
              속도: ${ship.speed || 0} knots<br/>
              방향: ${ship.course || 0}°
            </div>
          `);

        const marker = new mapboxgl.Marker(el)
          .setLngLat([ship.longitude, ship.latitude])
          .setPopup(popup)
          .addTo(map.current);

        markersRef.current[ship.shipId] = marker;
      }
    });
  }, [ships, selectedShip?.shipId, mapLoaded]);

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
        dockingEl.style.borderRadius = '8px';
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

    if (plannedRoute && plannedRoute.path && plannedRoute.path.length > 0) {
      // Convert pixel coordinates to lat/lng
      const coordinates = plannedRoute.path.map(point => {
        const latLng = pixelToLatLng(point[0], point[1]);
        return [latLng.lng, latLng.lat];
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