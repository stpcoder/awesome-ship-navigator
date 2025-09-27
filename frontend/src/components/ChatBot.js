import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './ChatBot.css';
import {
  RecommendDepartureModal,
  SendPlanModal,
  ShowRouteModal,
  ShowWeatherModal,
  SendSOSModal,
  SetFishingAreaModal,
  SetDockingPositionModal,
  ListFeaturesModal,
  ReceiveMessagesModal,
  SendMessageModal
} from './FunctionModals';

const ChatBot = () => {
  const navigate = useNavigate();
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [voiceLevel, setVoiceLevel] = useState(0);
  const [activeModal, setActiveModal] = useState(null);
  const [modalParameters, setModalParameters] = useState({});
  const [showDebugPanel, setShowDebugPanel] = useState(true);
  const [selectedShip, setSelectedShip] = useState('');
  const [ships, setShips] = useState([]);
  const [shipInfo, setShipInfo] = useState(null);
  const [showShipInfo, setShowShipInfo] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const micStreamRef = useRef(null);
  const animationRef = useRef(null);
  const recognitionRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const maxDurationTimerRef = useRef(null);
  const MAX_RECORDING_MS = 6000; // hard cap to avoid endless listening due to background noise

  // Fetch all ships on mount
  useEffect(() => {
    fetchShips();
  }, []);

  // Fetch ship info when selected ship changes
  useEffect(() => {
    if (selectedShip && ships.length > 0) {
      const selected = ships.find(ship => ship.shipId === selectedShip);
      if (selected) {
        setShipInfo(selected);
      }
    }
  }, [selectedShip, ships]);

  const fetchShips = async () => {
    try {
      const response = await fetch(`http://localhost:8000/api/eum/ships`);
      if (response.ok) {
        const shipsData = await response.json();
        setShips(shipsData);
        // Set first ship as selected by default
        if (shipsData.length > 0 && !selectedShip) {
          setSelectedShip(shipsData[0].shipId);
        }
      }
    } catch (error) {
      console.error('Failed to fetch ships:', error);
    }
  };

  useEffect(() => {
    // Initialize Web Speech API
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'ko-KR';  // Korean language
      recognition.maxAlternatives = 1;

      console.log('Speech Recognition initialized');
      console.log('Language:', recognition.lang);
      console.log('Continuous:', recognition.continuous);
      console.log('Interim Results:', recognition.interimResults);

      recognitionRef.current = recognition;

      recognitionRef.current.onresult = (event) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalTranscript += result[0].transcript;
          } else {
            interimTranscript += result[0].transcript;
          }
        }

        if (finalTranscript) {
          console.log('Final transcript:', finalTranscript);
          setTranscript(prev => {
            const newTranscript = (prev + ' ' + finalTranscript).trim();
            return newTranscript;
          });
          // Reset silence timer on final transcript
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }
        } else if (interimTranscript) {
          console.log('Interim transcript:', interimTranscript);
          // Don't update transcript for interim results to avoid confusion
          // Just show interim results temporarily without saving
        }
      };

      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error, event);

        // Handle different error types
        switch(event.error) {
          case 'no-speech':
            console.log('No speech detected - keep microphone on and try speaking');
            // Don't auto-stop on no-speech, let user retry
            break;
          case 'audio-capture':
            alert('마이크를 찾을 수 없습니다. 마이크가 연결되어 있는지 확인해주세요.');
            stopRecording();
            break;
          case 'not-allowed':
            alert('마이크 사용 권한이 거부되었습니다. 브라우저 설정에서 마이크 권한을 허용해주세요.');
            stopRecording();
            break;
          case 'network':
            console.error('네트워크 오류가 발생했습니다.');
            break;
          default:
            console.error('음성 인식 오류:', event.error);
        }
      };

      recognitionRef.current.onend = () => {
        console.log('Speech recognition ended');
        // Restart if still recording (for continuous recognition)
        if (mediaRecorderRef.current?.state === 'recording') {
          try {
            setTimeout(() => {
              if (mediaRecorderRef.current?.state === 'recording') {
                recognitionRef.current.start();
                console.log('Restarting speech recognition...');
              }
            }, 100);
          } catch (e) {
            console.log('Could not restart recognition:', e);
          }
        }
      };

      recognitionRef.current.onstart = () => {
        console.log('Speech recognition started successfully');
      };

      recognitionRef.current.onspeechstart = () => {
        console.log('Speech detected!');
      };

      recognitionRef.current.onspeechend = () => {
        console.log('Speech ended - will auto-stop after silence');
        // Don't immediately stop - let silence detection handle it
        // This prevents duplicate stops
      };
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (maxDurationTimerRef.current) {
        clearTimeout(maxDurationTimerRef.current);
        maxDurationTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (isRecording) {
      startVoiceDetection();
    }
    return () => {
      // Cleanup on unmount or when recording stops
      if (!isRecording) {
        stopVoiceDetection();
      }
    };
  }, [isRecording]);

  const startVoiceDetection = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;

      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);

      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);

      const detectVoiceLevel = () => {
        if (!analyserRef.current) return;

        analyserRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        const normalizedLevel = Math.min(average / 128, 1);
        setVoiceLevel(normalizedLevel);

        // Auto-stop on silence (adjusted for better detection)
        if (normalizedLevel < 0.03) {  // Slightly higher threshold for better detection
          if (!silenceTimerRef.current) {
            silenceTimerRef.current = setTimeout(() => {
              // Check if still recording
              if (isRecording && mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                // Check current transcript using callback to get latest state
                setTranscript((currentTranscript) => {
                  if (currentTranscript && currentTranscript.trim().length > 0) {
                    console.log('Auto-stopping due to silence with transcript:', currentTranscript);
                    stopRecording();
                  }
                  return currentTranscript;
                });
              }
            }, 1200); // 1.2 seconds of silence for balanced response
          }
        } else {
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }
        }

        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          animationRef.current = requestAnimationFrame(detectVoiceLevel);
        }
      };

      detectVoiceLevel();
    } catch (error) {
      console.error('Failed to start voice detection:', error);
    }
  };

  const stopVoiceDetection = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(track => track.stop());
      micStreamRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    setVoiceLevel(0);
  };

  const startRecording = async () => {
    try {
      setTranscript('');
      setResponse('');
      setIsRecording(true);
      console.log('Starting recording...');

      // Start Web Speech Recognition
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
          console.log('Starting speech recognition with language:', recognitionRef.current.lang);
        } catch (error) {
          console.error('Failed to start speech recognition:', error);
          // Continue with audio recording anyway
        }
      } else {
        console.warn('Speech recognition not available - using audio recording only');
      }

      // Start recording for backup
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        console.log('Recording stopped');
        stream.getTracks().forEach(track => track.stop());
        // Don't process transcript here - it will be handled by stopRecording
      };

      mediaRecorder.start();

      // Hard stop after MAX_RECORDING_MS to avoid endless recording with background music
      if (maxDurationTimerRef.current) {
        clearTimeout(maxDurationTimerRef.current);
        maxDurationTimerRef.current = null;
      }
      maxDurationTimerRef.current = setTimeout(() => {
        try {
          console.log(`Max recording duration reached (${MAX_RECORDING_MS}ms). Auto-stopping.`);
          stopRecording();
        } catch (e) {
          console.warn('Failed to stop after max duration:', e);
        }
      }, MAX_RECORDING_MS);
    } catch (error) {
      console.error('음성 녹음 시작 실패:', error);
      alert('마이크 접근 권한이 필요합니다.');
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    // Prevent duplicate calls
    if (!isRecording) {
      console.log('Already stopped, ignoring duplicate call');
      return;
    }

    setIsRecording(false);

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (error) {
        console.log('Recognition already stopped');
      }
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }

    // Clear silence timer to prevent duplicate calls
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    // Clear max duration timer
    if (maxDurationTimerRef.current) {
      clearTimeout(maxDurationTimerRef.current);
      maxDurationTimerRef.current = null;
    }

    // Delay voice detection stop to ensure proper cleanup
    setTimeout(() => {
      stopVoiceDetection();
    }, 100);

    // Process transcript immediately when stop is called
    setTranscript((currentTranscript) => {
      console.log('Processing final transcript on stop:', currentTranscript);
      if (currentTranscript && currentTranscript.trim()) {
        // Process the transcript only once here
        processTranscript(currentTranscript.trim());
      } else {
        console.log('No transcript to process');
        setIsProcessing(false);
      }
      return currentTranscript; // Keep the transcript displayed
    });
  };

  const processTranscript = async (text) => {
    console.log('Processing transcript:', text);
    if (!text || !text.trim()) {
      console.log('Empty text, skipping');
      return;
    }

    setIsProcessing(true);
    setTranscript(text);  // Ensure transcript is displayed

    try {
      console.log('Sending to server:', text);
      const response = await fetch('http://localhost:8000/api/chatbot/text', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message: text, session: { ship_id: selectedShip } })
      });

      console.log('Server response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('Server response data:', data);
        setResponse(data.response || '응답을 생성할 수 없습니다.');

        // Handle function-based responses
        if (data.function && data.function !== 'unknown') {
          setModalParameters({ ...data.parameters, shipId: selectedShip });
          // Small delay to show response before opening modal
          setTimeout(() => {
            setActiveModal(data.function);
          }, 1000);
        }
      } else {
        throw new Error(`서버 응답 실패: ${response.status}`);
      }
    } catch (error) {
      console.error('텍스트 처리 실패:', error);
      // Fallback response with mock data for testing
      const mockResponses = {
        '선박': '현재 포항 구룡포항에 3척의 선박이 정상 운항 중입니다.',
        '날씨': '현재 날씨는 맑음, 기온 18도, 풍속 3m/s입니다.',
        '경로': '경로 계획을 시작합니다. 출발지와 도착지를 선택해주세요.'
      };

      // Check for keywords and provide appropriate response
      const lowerText = text.toLowerCase();
      if (lowerText.includes('선박')) {
        setResponse(mockResponses['선박']);
      } else if (lowerText.includes('날씨')) {
        setResponse(mockResponses['날씨']);
      } else if (lowerText.includes('경로')) {
        setResponse(mockResponses['경로']);
      } else {
        setResponse('죄송합니다. 요청을 처리할 수 없습니다. 다시 시도해주세요.');
      }
    } finally {
      setIsProcessing(false);
    }
  };


  const handleVoiceButtonClick = () => {
    console.log('Voice button clicked, isRecording:', isRecording, 'transcript:', transcript);
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const handleFeatureSelect = (functionName) => {
    setActiveModal(functionName);
    setModalParameters({ shipId: selectedShip });
  };

  const getCurrentTime = () => {
    const now = new Date();
    return now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="chatbot-container">
      {/* VTS Navigation Button */}
      <Link to="/" className="vts-nav-button">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7"></rect>
          <rect x="14" y="3" width="7" height="7"></rect>
          <rect x="14" y="14" width="7" height="7"></rect>
          <rect x="3" y="14" width="7" height="7"></rect>
        </svg>
        VTS 시스템
      </Link>

      {/* Ship Selection Panel - Left Side */}
      <div className="ship-selection-panel">
        <h3>내 선박 선택</h3>
        <select
          value={selectedShip}
          onChange={(e) => setSelectedShip(e.target.value)}
          className="ship-selector"
        >
          {ships.length === 0 ? (
            <option value="">선박 목록을 불러오는 중...</option>
          ) : (
            ships.map(ship => (
              <option key={ship.shipId} value={ship.shipId}>
                {ship.shipId} ({ship.name})
              </option>
            ))
          )}
        </select>
        <div className="selected-ship-info">
          <p>선택된 선박</p>
          <h4>{selectedShip}</h4>
          {shipInfo && (
            <div style={{ fontSize: '0.8rem', marginTop: '10px', color: '#333' }}>
              <p>{shipInfo.name}</p>
              <p>{shipInfo.type}</p>
            </div>
          )}
        </div>

        <button
          onClick={() => navigate('/')}
          className="main-screen-btn"
        >
          메인 화면으로
        </button>
      </div>

      {/* Phone Mockup */}
      <div className="phone-mockup">
        <div className="phone-screen">
          <div className="phone-notch"></div>
          <div className="phone-status-bar">
            <div className="phone-time">{getCurrentTime()}</div>
            <div className="phone-indicators">
            </div>
          </div>
          <div className="phone-content">
            <div className="glass-background">
              <div className="liquid-blob blob-1"></div>
              <div className="liquid-blob blob-2"></div>
              <div className="liquid-blob blob-3"></div>
            </div>

            <div className="glass-card">
        <div className="status-bar">
          <div className="status-dot"></div>
          <span className="status-text">
            {isRecording ? '듣는 중...' : isProcessing ? '처리 중...' : '대기 중'}
          </span>
        </div>

        <div className="voice-interface">
          <div className="voice-visualizer">
            <div className={`voice-button-container ${isRecording ? 'recording' : ''}`}
                 style={{
                   transform: `scale(${1 + voiceLevel * 0.3})`,
                   transition: 'transform 0.1s ease'
                 }}>
              <button
                className="voice-button"
                onClick={handleVoiceButtonClick}
                disabled={isProcessing || isRecording}
              >
                {isRecording ? (
                  <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                    <rect x="18" y="18" width="12" height="12" rx="2" fill="currentColor"/>
                  </svg>
                ) : (
                  <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                    <rect x="19" y="12" width="10" height="18" rx="5" fill="currentColor"/>
                    <path d="M36 24V26C36 30.4183 32.4183 34 28 34H20C15.5817 34 12 30.4183 12 26V24"
                          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                    <path d="M24 34V40M18 40H30"
                          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                  </svg>
                )}
              </button>
              <div className="ripple-effect"></div>
              <div className="ripple-effect delay-1"></div>
              <div className="ripple-effect delay-2"></div>
            </div>
          </div>

          <div className="text-display">
            {isProcessing && (
              <div className="loading-container">
                <div className="loading-spinner">
                  <div className="spinner-ring"></div>
                  <div className="spinner-ring"></div>
                  <div className="spinner-ring"></div>
                </div>
                <p className="loading-text">처리하고 있습니다...</p>
              </div>
            )}

            {!isProcessing && transcript && (
              <div className="message-bubble user-message">
                <p className="message-text">{transcript}</p>
              </div>
            )}

            {!isProcessing && response && (
              <div className="message-bubble ai-message">
                <p className="message-text">{response}</p>
              </div>
            )}
          </div>
        </div>

        <div className="hint-text">
          {!isRecording && !transcript && !isProcessing && (
            <p>마이크를 눌러 시작하세요</p>
          )}
          {isRecording && (
            <p>말씀해 주세요...</p>
          )}
          {isProcessing && (
            <p>응답을 생성하는 중...</p>
          )}
        </div>
      </div>

      {/* Function Modals - Inside Phone Screen */}
      <RecommendDepartureModal
        isOpen={activeModal === 'recommend_departure'}
        onClose={() => setActiveModal(null)}
        parameters={modalParameters}
      />
      <SendPlanModal
        isOpen={activeModal === 'send_plan'}
        onClose={() => setActiveModal(null)}
        parameters={modalParameters}
      />
      <ShowRouteModal
        isOpen={activeModal === 'show_route'}
        onClose={() => setActiveModal(null)}
        parameters={modalParameters}
      />
      <ShowWeatherModal
        isOpen={activeModal === 'show_weather'}
        onClose={() => setActiveModal(null)}
        parameters={modalParameters}
      />
      <SendSOSModal
        isOpen={activeModal === 'send_sos'}
        onClose={() => setActiveModal(null)}
        parameters={modalParameters}
      />
      <SetFishingAreaModal
        isOpen={activeModal === 'set_fishing_area'}
        onClose={() => setActiveModal(null)}
        parameters={modalParameters}
      />
      <SetDockingPositionModal
        isOpen={activeModal === 'set_docking_position'}
        onClose={() => setActiveModal(null)}
        parameters={modalParameters}
      />
      <ListFeaturesModal
        isOpen={activeModal === 'list_features'}
        onClose={() => setActiveModal(null)}
        parameters={modalParameters}
        onFeatureSelect={handleFeatureSelect}
      />
      <ReceiveMessagesModal
        isOpen={activeModal === 'receive_messages'}
        onClose={() => setActiveModal(null)}
        parameters={modalParameters}
      />
      <SendMessageModal
        isOpen={activeModal === 'send_message'}
        onClose={() => setActiveModal(null)}
        parameters={modalParameters}
      />

      {/* Ship Info Panel - Bottom of Phone */}
      {shipInfo && (
        <div
          className="phone-ship-info-panel"
          style={{
            position: 'absolute',
            bottom: showShipInfo ? '20px' : '-280px',
            left: '20px',
            right: '20px',
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(20px)',
            borderRadius: '20px',
            padding: '20px',
            boxShadow: '0 10px 40px rgba(0, 0, 0, 0.1)',
            transition: 'bottom 0.3s ease',
            zIndex: 10,
            maxHeight: '300px',
            overflow: 'auto'
          }}
        >
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '15px'
          }}>
            <h4 style={{ margin: 0, color: '#1a1a1a', fontSize: '1rem' }}>선박 상세 정보</h4>
            <button
              onClick={() => setShowShipInfo(!showShipInfo)}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '1.2rem',
                cursor: 'pointer',
                color: '#666',
                padding: '0 5px'
              }}
            >
              {showShipInfo ? '✕' : '▲'}
            </button>
          </div>

          {showShipInfo && shipInfo && (
            <div style={{ fontSize: '0.85rem', color: '#333' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '15px' }}>
                <div>
                  <strong>선박명:</strong> {shipInfo.name}
                </div>
                <div>
                  <strong>ID:</strong> {shipInfo.shipId}
                </div>
                <div>
                  <strong>유형:</strong> {shipInfo.type}
                </div>
                <div>
                  <strong>모항:</strong> {shipInfo.pol}
                </div>
                <div>
                  <strong>길이:</strong> {shipInfo.length}m
                </div>
                <div>
                  <strong>폭:</strong> {shipInfo.breath}m
                </div>
                <div>
                  <strong>깊이:</strong> {shipInfo.depth}m
                </div>
                <div>
                  <strong>총톤수:</strong> {shipInfo.gt}톤
                </div>
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid #e0e0e0', margin: '15px 0' }} />

              {shipInfo.type === '어선' && shipInfo.fishingAreaLat && (
                <div style={{ marginBottom: '10px' }}>
                  <strong>어장 위치:</strong><br/>
                  <span style={{ marginLeft: '10px' }}>
                    위도: {parseFloat(shipInfo.fishingAreaLat).toFixed(4)}°,
                    경도: {parseFloat(shipInfo.fishingAreaLng).toFixed(4)}°
                  </span>
                </div>
              )}

              {shipInfo.dockingLat && (
                <div>
                  <strong>정박 위치:</strong><br/>
                  <span style={{ marginLeft: '10px' }}>
                    위도: {parseFloat(shipInfo.dockingLat).toFixed(4)}°,
                    경도: {parseFloat(shipInfo.dockingLng).toFixed(4)}°
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Toggle Button for Ship Info - Always Visible */}
      {!showShipInfo && shipInfo && (
        <button
          onClick={() => setShowShipInfo(true)}
          style={{
            position: 'absolute',
            bottom: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(255, 255, 255, 0.9)',
            backdropFilter: 'blur(10px)',
            border: 'none',
            borderRadius: '20px',
            padding: '10px 20px',
            fontSize: '0.9rem',
            fontWeight: '500',
            color: '#333',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
            cursor: 'pointer',
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          선박 정보 보기
        </button>
      )}
    </div>
  </div>
</div>

      {/* Debug Panel - Outside Phone */}
      <div className="debug-panel">
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '15px'
        }}>
          <h3>디버그 패널</h3>
          <button
            onClick={() => setShowDebugPanel(!showDebugPanel)}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: 'rgba(255, 255, 255, 0.6)'
            }}
          >
            {showDebugPanel ? '−' : '+'}
          </button>
        </div>

        {showDebugPanel && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button
              onClick={() => handleFeatureSelect('recommend_departure')}
              className="debug-button"
            >
              입출항 계획
            </button>
            <button
              onClick={() => handleFeatureSelect('show_route')}
              className="debug-button"
            >
              경로 표시
            </button>
            <button
              onClick={() => handleFeatureSelect('show_weather')}
              className="debug-button"
            >
              날씨 정보
            </button>
            <button
              onClick={() => handleFeatureSelect('send_sos')}
              className="debug-button emergency"
            >
              긴급 신호
            </button>
            <button
              onClick={() => handleFeatureSelect('set_fishing_area')}
              className="debug-button"
            >
              어장 지정
            </button>
            <button
              onClick={() => handleFeatureSelect('set_docking_position')}
              className="debug-button"
            >
              정박 위치
            </button>
            <button
              onClick={() => handleFeatureSelect('list_features')}
              className="debug-button"
            >
              기능 목록
            </button>
            <button
              onClick={() => handleFeatureSelect('receive_messages')}
              className="debug-button"
            >
              수신 메시지
            </button>
            <button
              onClick={() => handleFeatureSelect('send_message')}
              className="debug-button"
            >
              메시지 전송
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatBot;