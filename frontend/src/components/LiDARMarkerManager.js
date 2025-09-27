import React, { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';

const LiDARMarkerManager = ({ map, lidarData = [], onLiDARSelect }) => {
  const markersRef = useRef({});
  const popupRef = useRef(null);

  // Create markers for LiDAR devices
  useEffect(() => {
    if (!map || !map.loaded()) return;

    // Clear existing markers
    Object.values(markersRef.current).forEach(marker => {
      marker.remove();
    });
    markersRef.current = {};

    // Close any existing popup
    if (popupRef.current) {
      popupRef.current.remove();
      popupRef.current = null;
    }

    // Create markers for each LiDAR device
    lidarData.forEach(lidar => {
      // Create marker element
      const el = document.createElement('div');
      el.className = 'lidar-marker';
      el.style.cssText = `
        position: relative;
        width: 36px;
        height: 36px;
        cursor: pointer;
      `;

      // Create icon
      const icon = document.createElement('div');
      icon.style.cssText = `
        width: 36px;
        height: 36px;
        background-color: #9b59b6;
        border: 2px solid white;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 10px rgba(0,0,0,0.5);
        transition: all 0.3s ease;
      `;
      icon.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 1.74.5 3.37 1.41 4.84.95 1.54 2.2 2.86 3.16 4.4.47.75.81 1.45 1.17 2.26.26-.81.69-1.51 1.17-2.26.96-1.53 2.21-2.85 3.16-4.4C18.5 12.37 19 10.74 19 9c0-3.87-3.13-7-7-7zm0 9.75c-1.52 0-2.75-1.23-2.75-2.75S10.48 6.25 12 6.25 14.75 7.48 14.75 9 13.52 11.75 12 11.75z"/>
        </svg>
      `;
      el.appendChild(icon);

      // Add hover effect
      el.addEventListener('mouseenter', () => {
        icon.style.backgroundColor = '#a569bd';
        icon.style.transform = 'scale(1.1)';
      });
      el.addEventListener('mouseleave', () => {
        icon.style.backgroundColor = '#9b59b6';
        icon.style.transform = 'scale(1)';
      });

      // Parse coordinates - IMPORTANT: longitude comes first for setLngLat
      const longitude = parseFloat(lidar.longitude || lidar.lng);
      const latitude = parseFloat(lidar.latitude || lidar.lat);

      // Create marker - no anchor property to avoid offset issues
      const marker = new mapboxgl.Marker(el)
        .setLngLat([longitude, latitude])
        .addTo(map);

      // Handle click
      el.addEventListener('click', () => {
        // Close existing popup
        if (popupRef.current) {
          popupRef.current.remove();
        }

        // Create popup content
        const popupContent = document.createElement('div');
        popupContent.style.cssText = `
          min-width: 200px;
          max-width: 300px;
          padding: 10px;
        `;

        // Popup header
        const header = document.createElement('div');
        header.style.cssText = `
          font-weight: bold;
          font-size: 14px;
          margin-bottom: 8px;
          padding-bottom: 8px;
          border-bottom: 1px solid #e0e0e0;
          color: #9b59b6;
        `;
        header.textContent = lidar.name;
        popupContent.appendChild(header);

        // Device info
        const info = document.createElement('div');
        info.style.cssText = `
          font-size: 13px;
          color: #666;
          margin-bottom: 10px;
        `;
        info.innerHTML = `
          <div style="margin-bottom: 4px;">주소: ${lidar.address}</div>
          <div>좌표: ${parseFloat(lidar.latitude).toFixed(6)}, ${parseFloat(lidar.longitude).toFixed(6)}</div>
        `;
        popupContent.appendChild(info);

        // Automatically show statistics on popup open (not button click)
        if (onLiDARSelect) {
          // Call onLiDARSelect immediately to show stats in bottom right
          onLiDARSelect(lidar);
        }

        // Create popup
        const popup = new mapboxgl.Popup({
          closeButton: true,
          closeOnClick: true,
          offset: 25
        })
          .setLngLat([longitude, latitude])
          .setDOMContent(popupContent)
          .addTo(map);

        popupRef.current = popup;
      });

      markersRef.current[lidar.id] = marker;
    });
  }, [map, lidarData, onLiDARSelect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      Object.values(markersRef.current).forEach(marker => {
        marker.remove();
      });
      if (popupRef.current) {
        popupRef.current.remove();
      }
    };
  }, []);

  return null;
};

export default LiDARMarkerManager;