import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';

const CCTVMarkerManager = ({ map, cctvData = [], onCCTVSelect, selectedCCTV = null }) => {
  const markersRef = useRef({});
  const popupRef = useRef(null);
  const [groupedCCTV, setGroupedCCTV] = useState({});

  // Group CCTVs by location
  useEffect(() => {
    if (!cctvData || cctvData.length === 0) {
      setGroupedCCTV({});
      return;
    }

    // Filter data if selectedCCTV is provided
    let dataToGroup = cctvData;
    if (selectedCCTV) {
      // Only show the selected CCTV
      dataToGroup = cctvData.filter(cctv => cctv.id === selectedCCTV.id);
    }

    const groups = {};
    dataToGroup.forEach(cctv => {
      // Use precise grouping to avoid incorrect grouping
      const lat = parseFloat(cctv.latitude).toFixed(6);
      const lng = parseFloat(cctv.longitude).toFixed(6);
      const key = `${lat}_${lng}`;

      if (!groups[key]) {
        groups[key] = {
          lat: parseFloat(cctv.latitude),
          lng: parseFloat(cctv.longitude),
          address: cctv.address,
          devices: []
        };
      }
      groups[key].devices.push(cctv);
    });

    setGroupedCCTV(groups);
  }, [cctvData, selectedCCTV]);

  // Create markers for grouped CCTVs
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

    // Create markers for each group
    Object.entries(groupedCCTV).forEach(([key, group]) => {
      // Create marker element
      const el = document.createElement('div');
      el.className = 'cctv-marker';
      el.style.cssText = `
        position: relative;
        width: 36px;
        height: 36px;
        cursor: pointer;
      `;

      // Create icon container (centered)
      const iconContainer = document.createElement('div');
      iconContainer.style.cssText = `
        position: relative;
        width: 36px;
        height: 36px;
      `;

      const icon = document.createElement('div');
      icon.style.cssText = `
        width: 36px;
        height: 36px;
        background-color: #4169E1;
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
          <path d="M17,10.5V7A1,1 0 0,0 16,6H4A1,1 0 0,0 3,7V17A1,1 0 0,0 4,18H16A1,1 0 0,0 17,17V13.5L21,17.5V6.5L17,10.5Z"/>
        </svg>
      `;
      iconContainer.appendChild(icon);

      // Add count badge if multiple devices at this location
      if (group.devices.length > 1) {
        const badge = document.createElement('div');
        badge.style.cssText = `
          position: absolute;
          top: -4px;
          right: -4px;
          background-color: #FF6B6B;
          color: white;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: bold;
          border: 2px solid white;
          box-shadow: 0 2px 5px rgba(0,0,0,0.3);
          pointer-events: none;
        `;
        badge.textContent = group.devices.length;
        iconContainer.appendChild(badge);
      }

      el.appendChild(iconContainer);

      // Add hover effect
      el.addEventListener('mouseenter', () => {
        icon.style.backgroundColor = '#5A7FE8';
        icon.style.transform = 'scale(1.1)';
      });
      el.addEventListener('mouseleave', () => {
        icon.style.backgroundColor = '#4169E1';
        icon.style.transform = 'scale(1)';
      });

      // IMPORTANT: longitude comes first for setLngLat
      // Set anchor to 'center' to prevent offset issues
      const marker = new mapboxgl.Marker({
        element: el,
        anchor: 'center'  // Center the marker on its coordinates
      })
        .setLngLat([group.lng, group.lat])
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
          color: #4169E1;
        `;
        header.textContent = group.devices.length > 1
          ? `CCTV 장치 (${group.devices.length}개)`
          : group.devices[0].name;
        popupContent.appendChild(header);

        // Device list (if multiple)
        if (group.devices.length > 1) {
          const deviceList = document.createElement('div');
          deviceList.style.cssText = `
            max-height: 200px;
            overflow-y: auto;
          `;

          group.devices.forEach((device) => {
            const deviceItem = document.createElement('div');
            deviceItem.style.cssText = `
              padding: 8px;
              margin: 4px 0;
              background-color: #f5f5f5;
              border-radius: 6px;
              cursor: pointer;
              transition: all 0.2s ease;
              font-size: 13px;
            `;

            deviceItem.innerHTML = `
              <div style="font-weight: 600; color: #333; margin-bottom: 2px;">
                ${device.name}
              </div>
              <div style="color: #666; font-size: 11px;">
                ${device.address}
              </div>
            `;

            deviceItem.addEventListener('mouseenter', () => {
              deviceItem.style.backgroundColor = '#4169E1';
              deviceItem.style.color = 'white';
              deviceItem.querySelector('div:first-child').style.color = 'white';
              deviceItem.querySelector('div:last-child').style.color = '#e0e0e0';
            });

            deviceItem.addEventListener('mouseleave', () => {
              deviceItem.style.backgroundColor = '#f5f5f5';
              deviceItem.style.color = 'inherit';
              deviceItem.querySelector('div:first-child').style.color = '#333';
              deviceItem.querySelector('div:last-child').style.color = '#666';
            });

            deviceItem.addEventListener('click', (e) => {
              e.stopPropagation();
              if (onCCTVSelect) {
                onCCTVSelect(device);
              }
              // Close popup after selection
              if (popupRef.current) {
                popupRef.current.remove();
                popupRef.current = null;
              }
            });

            deviceList.appendChild(deviceItem);
          });

          popupContent.appendChild(deviceList);
        } else {
          // Single device - show info and button
          const info = document.createElement('div');
          info.style.cssText = `
            font-size: 13px;
            color: #666;
            margin-bottom: 10px;
          `;
          info.innerHTML = `
            <div style="margin-bottom: 4px;">주소: ${group.devices[0].address}</div>
            <div>좌표: ${group.lat.toFixed(6)}, ${group.lng.toFixed(6)}</div>
          `;
          popupContent.appendChild(info);

          // View video button
          if (onCCTVSelect) {
            const button = document.createElement('button');
            button.style.cssText = `
              width: 100%;
              padding: 8px;
              background-color: #4169E1;
              color: white;
              border: none;
              border-radius: 4px;
              cursor: pointer;
              font-size: 13px;
              font-weight: 600;
              transition: all 0.2s ease;
            `;
            button.textContent = '영상 보기';

            button.addEventListener('mouseenter', () => {
              button.style.backgroundColor = '#5A7FE8';
            });

            button.addEventListener('mouseleave', () => {
              button.style.backgroundColor = '#4169E1';
            });

            button.addEventListener('click', (e) => {
              e.stopPropagation();
              onCCTVSelect(group.devices[0]);
              // Close popup after selection
              if (popupRef.current) {
                popupRef.current.remove();
                popupRef.current = null;
              }
            });

            popupContent.appendChild(button);
          }
        }

        // Create popup with adjusted offset for centered marker
        const popup = new mapboxgl.Popup({
          closeButton: true,
          closeOnClick: true,
          offset: 25,  // Standard offset for circular markers
          className: 'cctv-popup'
        })
          .setLngLat([group.lng, group.lat])
          .setDOMContent(popupContent)
          .addTo(map);

        popupRef.current = popup;
      });

      markersRef.current[key] = marker;
    });
  }, [map, groupedCCTV, onCCTVSelect]);

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

export default CCTVMarkerManager;