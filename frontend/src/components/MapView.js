import React, { useRef, useEffect, useState } from 'react';
import './MapView.css';
import obstaclesData from '../data/obstacles.json';

const MapView = ({
  routes,
  realtimeData,
  sensorData,
  currentTime,
  plannedRoute,
  onMapClick,
  mapClickMode,
  routePoints,
  showRealtimeShips,
  showRoutes
}) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight
        });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  useEffect(() => {
    drawMap();
  }, [routes, realtimeData, currentTime, plannedRoute, routePoints, dimensions, showRealtimeShips, showRoutes]);

  const handleCanvasClick = (event) => {
    if (!onMapClick || !mapClickMode) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const { width, height } = dimensions;
    const mapWidth = 1900;
    const mapHeight = 1150;

    // Calculate aspect ratio and offsets
    const aspectRatio = mapWidth / mapHeight;
    const containerAspect = width / height;

    let drawWidth, drawHeight, offsetLeft, offsetTop;

    if (containerAspect > aspectRatio) {
      drawHeight = height;
      drawWidth = height * aspectRatio;
      offsetLeft = (width - drawWidth) / 2;
      offsetTop = 0;
    } else {
      drawWidth = width;
      drawHeight = width / aspectRatio;
      offsetLeft = 0;
      offsetTop = (height - drawHeight) / 2;
    }

    // Convert click position to map coordinates
    const relativeX = event.clientX - rect.left - offsetLeft;
    const relativeY = event.clientY - rect.top - offsetTop;

    // Check if click is within the map area
    if (relativeX < 0 || relativeX > drawWidth || relativeY < 0 || relativeY > drawHeight) {
      return; // Click outside map area
    }

    const x = (relativeX / drawWidth) * mapWidth;
    const y = (relativeY / drawHeight) * mapHeight;

    onMapClick([x, y]);
  };

  const drawMap = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const { width, height } = dimensions;

    // Set canvas size
    canvas.width = width;
    canvas.height = height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Scale factors - match the actual map dimensions
    // nn.png is 2048x1237, but obstacles are designed for smaller area
    // Adjust map dimensions to match obstacle coordinate system
    const mapWidth = 1900;  // Adjusted to match obstacle scale
    const mapHeight = 1150; // Adjusted to match obstacle scale

    // Maintain aspect ratio
    const aspectRatio = mapWidth / mapHeight;
    const containerAspect = width / height;

    let drawWidth, drawHeight, offsetLeft, offsetTop;

    if (containerAspect > aspectRatio) {
      // Container is wider - fit by height
      drawHeight = height;
      drawWidth = height * aspectRatio;
      offsetLeft = (width - drawWidth) / 2;
      offsetTop = 0;
    } else {
      // Container is taller - fit by width
      drawWidth = width;
      drawHeight = width / aspectRatio;
      offsetLeft = 0;
      offsetTop = (height - drawHeight) / 2;
    }

    const scaleX = drawWidth / mapWidth;
    const scaleY = drawHeight / mapHeight;

    // Offset to align obstacles with background
    const obstacleOffsetX = 0; // Fine-tune if needed
    const obstacleOffsetY = 0; // Fine-tune if needed

    // Draw background grid (subtle) - removed to reduce clutter
    // Uncomment if you want grid lines
    /*
    ctx.strokeStyle = '#f0f0f0';
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= mapWidth; x += 100) {
      ctx.beginPath();
      ctx.moveTo(offsetLeft + x * scaleX, offsetTop);
      ctx.lineTo(offsetLeft + x * scaleX, offsetTop + drawHeight);
      ctx.stroke();
    }
    for (let y = 0; y <= mapHeight; y += 100) {
      ctx.beginPath();
      ctx.moveTo(offsetLeft, offsetTop + y * scaleY);
      ctx.lineTo(offsetLeft + drawWidth, offsetTop + y * scaleY);
      ctx.stroke();
    }
    */

    // Draw obstacles from JSON
    ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.6)';
    ctx.lineWidth = 2;

    if (obstaclesData && Array.isArray(obstaclesData)) {
      obstaclesData.forEach(obstacle => {
        if (obstacle.polygon && obstacle.polygon.length > 0) {
          ctx.beginPath();
          obstacle.polygon.forEach((point, index) => {
            // Apply scaling and offset to align with background
            const x = offsetLeft + (point[0] + obstacleOffsetX) * scaleX;
            const y = offsetTop + (point[1] + obstacleOffsetY) * scaleY;
            if (index === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
          });
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      });
    }

    // Sensor locations disabled (using random positions)
    // To enable: implement proper lat/lon to pixel conversion

    // Draw existing routes (only if toggle is on)
    if (showRoutes) {
      routes.forEach(route => {
        if (route.path_points && route.path_points.length > 0) {
        ctx.strokeStyle = route.optimization_mode === 'flexible' ? '#667eea' : '#ff9f43';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);

        ctx.beginPath();
        route.path_points.forEach((point, index) => {
          const x = offsetLeft + point[0] * scaleX;
          const y = offsetTop + point[1] * scaleY;
          if (index === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        });
        ctx.stroke();

        // Draw ship position based on current time with interpolation
        if (currentTime >= route.departure_time && currentTime <= route.arrival_time) {
          const progress = (currentTime - route.departure_time) /
                          (route.arrival_time - route.departure_time);
          const totalPoints = route.path_points.length - 1;
          const exactIndex = progress * totalPoints;
          const pointIndex = Math.floor(exactIndex);
          const fraction = exactIndex - pointIndex;

          let shipX, shipY;

          if (pointIndex < totalPoints) {
            // Interpolate between two points for smooth movement
            const point1 = route.path_points[pointIndex];
            const point2 = route.path_points[pointIndex + 1];
            shipX = point1[0] + (point2[0] - point1[0]) * fraction;
            shipY = point1[1] + (point2[1] - point1[1]) * fraction;
          } else {
            // At the end point
            const point = route.path_points[totalPoints];
            shipX = point[0];
            shipY = point[1];
          }

          // Draw ship
          ctx.fillStyle = '#2ecc71';
          ctx.beginPath();
          ctx.arc(offsetLeft + shipX * scaleX, offsetTop + shipY * scaleY, 8, 0, 2 * Math.PI);
          ctx.fill();

          // Draw ship ID
          ctx.fillStyle = '#000';
          ctx.font = '12px Arial';
          ctx.fillText(route.ship_id, offsetLeft + shipX * scaleX + 10, offsetTop + shipY * scaleY - 10);
        }
      }
      });
    }

    // Draw planned route (only if toggle is on)
    if (showRoutes && plannedRoute && plannedRoute.path_points) {
      ctx.strokeStyle = '#e74c3c';
      ctx.lineWidth = 3;
      ctx.setLineDash([5, 5]);

      ctx.beginPath();
      plannedRoute.path_points.forEach((point, index) => {
        const x = offsetLeft + point[0] * scaleX;
        const y = offsetTop + point[1] * scaleY;
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
    }

    // Draw route planning points
    if (routePoints.start) {
      ctx.fillStyle = '#2ecc71';
      ctx.beginPath();
      ctx.arc(offsetLeft + routePoints.start[0] * scaleX, offsetTop + routePoints.start[1] * scaleY, 10, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('S', offsetLeft + routePoints.start[0] * scaleX, offsetTop + routePoints.start[1] * scaleY);
    }

    if (routePoints.goal) {
      ctx.fillStyle = '#e74c3c';
      ctx.beginPath();
      ctx.arc(offsetLeft + routePoints.goal[0] * scaleX, offsetTop + routePoints.goal[1] * scaleY, 10, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('G', offsetLeft + routePoints.goal[0] * scaleX, offsetTop + routePoints.goal[1] * scaleY);
    }

    // Draw real-time ship positions from EUM API (only if toggle is on)
    if (showRealtimeShips && realtimeData) {
      realtimeData.forEach(ship => {
        if (ship.current_location && ship.current_location.latitude && ship.current_location.longitude) {
        // Convert real coordinates to pixel position
        // Note: This is a simplified conversion - in production, use proper map projection
        // For Guryongpo port area (approx 36.0°N, 129.5°E)
        const lon = ship.current_location.longitude;
        const lat = ship.current_location.latitude;

        // Simple linear mapping for demo (adjust based on actual port coordinates)
        const x = ((lon - 129.4) / 0.02) * mapWidth; // Map longitude range
        const y = (1 - (lat - 35.98) / 0.014) * mapHeight; // Map latitude range

        // Only draw if within bounds
        if (x >= 0 && x <= mapWidth && y >= 0 && y <= mapHeight) {
          // Draw ship from EUM API (different style from our planned routes)
          const shipX = offsetLeft + x * scaleX;
          const shipY = offsetTop + y * scaleY;

          ctx.fillStyle = '#8e44ad'; // Purple for EUM real-time ships
          ctx.strokeStyle = '#5b2c6f';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(shipX, shipY, 7, 0, 2 * Math.PI);
          ctx.fill();
          ctx.stroke();

          // Draw heading arrow if available
          if (ship.current_location.course !== null) {
            const heading = ship.current_location.course;
            const arrowLength = 20;
            const endX = shipX + Math.cos((heading - 90) * Math.PI / 180) * arrowLength;
            const endY = shipY + Math.sin((heading - 90) * Math.PI / 180) * arrowLength;

            ctx.strokeStyle = '#5b2c6f';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(shipX, shipY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
          }

          // Draw ship name
          if (ship.name) {
            ctx.fillStyle = '#2c3e50';
            ctx.font = '10px Arial';
            ctx.fillText(ship.name, shipX + 10, shipY - 10);
          }
        }
      }
      });
    }
  };

  return (
    <div className="map-container" ref={containerRef}>
      {mapClickMode && (
        <div className="map-click-indicator">
          {mapClickMode === 'start' ? '출발점을 클릭하세요' : '도착점을 클릭하세요'}
        </div>
      )}
      <div className="map-background">
        <img
          src="/nn.png"
          alt="Port Map"
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            opacity: 0.5,
            objectFit: 'contain',  // Show entire image without cropping
            objectPosition: 'center'  // Center the image
          }}
        />
        <canvas
          ref={canvasRef}
          className="map-canvas"
          onClick={handleCanvasClick}
          style={{ cursor: mapClickMode ? 'crosshair' : 'default' }}
        />
      </div>

      <div className="map-legend">
        <div className="legend-item">
          <span className="legend-color" style={{ background: 'rgba(255, 0, 0, 0.3)', border: '1px solid rgba(255, 0, 0, 0.6)' }}></span>
          <span>장애물</span>
        </div>
        <div className="legend-item">
          <span className="legend-color" style={{ background: '#8e44ad' }}></span>
          <span>EUM 실시간 선박</span>
        </div>
        <div className="legend-item">
          <span className="legend-color" style={{ background: '#667eea' }}></span>
          <span>수용 O (Flexible)</span>
        </div>
        <div className="legend-item">
          <span className="legend-color" style={{ background: '#ff9f43' }}></span>
          <span>수용 X (Fixed)</span>
        </div>
        <div className="legend-item">
          <span className="legend-color" style={{ background: '#e74c3c' }}></span>
          <span>계획된 경로</span>
        </div>
        <div className="legend-item">
          <span className="legend-color" style={{ background: '#ff6b6b' }}></span>
          <span>CCTV</span>
        </div>
        <div className="legend-item">
          <span className="legend-color" style={{ background: '#4ecdc4' }}></span>
          <span>LiDAR</span>
        </div>
      </div>
    </div>
  );
};

export default MapView;