import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';

const CCTVVideo = ({ cctvId, cctvName, onClose }) => {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Map CCTV IDs to camera numbers based on CCTV name
  const getCameraNumber = (id, name) => {
    // Extract camera number from CCTV name like "구룡포 북방파제 AI-01-001"
    // The format seems to be AI-XX-YYY where XX might be the camera number
    if (name) {
      const match = name.match(/AI-(\d+)-/);
      if (match) {
        return parseInt(match[1], 10);
      }
    }

    // Fallback to ID-based extraction
    const idMatch = String(id).match(/\d+/);
    if (idMatch) {
      return parseInt(idMatch[0], 10);
    }
    return 1; // Default to cam1 if no number found
  };

  useEffect(() => {
    if (!videoRef.current) return;

    const camNumber = getCameraNumber(cctvId, cctvName);
    const videoUrl = `https://hls-cctv.pohang-eum.co.kr/cam${camNumber}/main_stream.m3u8`;

    console.log('Loading CCTV stream:', videoUrl);

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90
      });

      hlsRef.current = hls;

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsLoading(false);
        videoRef.current.play().catch(e => {
          console.error('Error playing video:', e);
        });
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        console.error('HLS Error:', data);
        if (data.fatal) {
          switch(data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              setError('네트워크 오류가 발생했습니다.');
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              setError('미디어 오류가 발생했습니다.');
              hls.recoverMediaError();
              break;
            default:
              setError('영상을 로드할 수 없습니다.');
              hls.destroy();
              break;
          }
        }
      });

      hls.loadSource(videoUrl);
      hls.attachMedia(videoRef.current);
    } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
      // For Safari native HLS support
      videoRef.current.src = videoUrl;
      videoRef.current.addEventListener('loadedmetadata', () => {
        setIsLoading(false);
        videoRef.current.play().catch(e => {
          console.error('Error playing video:', e);
        });
      });
    } else {
      setError('이 브라우저는 HLS 스트리밍을 지원하지 않습니다.');
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [cctvId]);

  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      width: '400px',
      height: '300px',
      backgroundColor: 'rgba(0, 0, 0, 0.9)',
      borderRadius: '12px',
      border: '2px solid rgba(255, 255, 255, 0.2)',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
      overflow: 'hidden',
      zIndex: 1000
    }}>
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
          CCTV: {cctvName || `Camera ${getCameraNumber(cctvId, cctvName)}`}
        </span>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#fff',
            fontSize: '20px',
            cursor: 'pointer',
            padding: '0 5px',
            opacity: 0.8,
            transition: 'opacity 0.2s'
          }}
          onMouseEnter={(e) => e.target.style.opacity = 1}
          onMouseLeave={(e) => e.target.style.opacity = 0.8}
        >
          ×
        </button>
      </div>

      <div style={{
        position: 'relative',
        width: '100%',
        height: 'calc(100% - 45px)'
      }}>
        {isLoading && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: '#fff',
            fontSize: '14px'
          }}>
            영상 로딩 중...
          </div>
        )}

        {error && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: '#ff6b6b',
            fontSize: '14px',
            textAlign: 'center',
            padding: '0 20px'
          }}>
            {error}
          </div>
        )}

        <video
          ref={videoRef}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: isLoading || error ? 'none' : 'block'
          }}
          controls
          muted
          playsInline
        />
      </div>
    </div>
  );
};

export default CCTVVideo;