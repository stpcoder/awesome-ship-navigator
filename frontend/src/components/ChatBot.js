import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
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

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000';

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
  const [messageNotification, setMessageNotification] = useState(null);
  const [showMessageNotification, setShowMessageNotification] = useState(false);
  const [collisionWarnings, setCollisionWarnings] = useState([]); // Store collision warnings
  const [showCollisionWarning, setShowCollisionWarning] = useState(false);
  const [warnedShips, setWarnedShips] = useState(new Set()); // Track ships that have been warned
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const micStreamRef = useRef(null);
  const animationRef = useRef(null);
  const recognitionRef = useRef(null);
  const stopRequestedRef = useRef(false);
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
      const response = await fetch(`${API_BASE}/api/eum/ships`);
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
        // Restart only if actively recording and not stopping intentionally
        if (!stopRequestedRef.current && mediaRecorderRef.current?.state === 'recording') {
          try {
            setTimeout(() => {
              if (!stopRequestedRef.current && mediaRecorderRef.current?.state === 'recording') {
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
      stopRequestedRef.current = false;
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
      // Force stop after 6 seconds regardless of noise
      if (maxDurationTimerRef.current) {
        clearTimeout(maxDurationTimerRef.current);
        maxDurationTimerRef.current = null;
      }
      maxDurationTimerRef.current = setTimeout(() => {
        console.log(`Max recording duration reached (${MAX_RECORDING_MS}ms). Force stopping.`);
        stopRecording(true);
      }, MAX_RECORDING_MS);
    } catch (error) {
      console.error('음성 녹음 시작 실패:', error);
      alert('마이크 접근 권한이 필요합니다.');
      setIsRecording(false);
    }
  };

  const stopRecording = (isTimeout = false) => {
    // Prevent duplicate calls
    if (!isRecording) {
      console.log('Already stopped, ignoring duplicate call');
      return;
    }

    setIsRecording(false);
    stopRequestedRef.current = true;

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (error) {
        console.log('Recognition already stopped');
      }
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        console.warn('MediaRecorder stop failed:', e);
      }
    }
    mediaRecorderRef.current = null;

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

      if (isTimeout) {
        // For timeout case, process whatever we have or show timeout message
        if (currentTranscript && currentTranscript.trim()) {
          // Process the partial transcript with timeout indication
          setResponse('6초 제한 시간이 초과되었습니다. 녹음된 내용을 처리합니다...');
          processTranscript(currentTranscript.trim());
        } else {
          // No transcript captured, show timeout message
          setResponse('6초 제한 시간이 초과되었습니다. 음성이 감지되지 않았습니다. 다시 시도해주세요.');
          setIsProcessing(false);
        }
      } else {
        // Normal stop (user button or silence detection)
        if (currentTranscript && currentTranscript.trim()) {
          processTranscript(currentTranscript.trim());
        } else {
          console.log('No transcript to process');
          setIsProcessing(false);
        }
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
        console.log('Function received:', data.function);
        console.log('Parameters received:', data.parameters);

        // Check if response has the expected format
        if (!data.response && !data.message) {
          console.error('No response or message in data:', data);
          setResponse('응답을 생성할 수 없습니다.');
        } else {
          setResponse(data.response || data.message || '응답을 생성할 수 없습니다.');
        }

        // Handle function-based responses
        if (data.function && data.function !== 'unknown') {
          console.log('Processing function:', data.function);
          // Pass all data from backend including calculated routes
          const modalParams = {
            ...data.parameters,
            shipId: selectedShip
          };

          // If backend already calculated a route, pass it to modal
          if (data.optimal_route) {
            modalParams.precalculatedRoute = data.optimal_route;
            modalParams.routeSource = 'optimal';
          } else if (data.route_data) {
            modalParams.precalculatedRoute = data.route_data;
            modalParams.routeSource = 'user_time';
          }

          if (data.needs_confirmation !== undefined) {
            modalParams.needsConfirmation = data.needs_confirmation;
          }

          setModalParameters(modalParams);
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

  // Function to show message notification
  const showNotification = (message) => {
    setMessageNotification(message);
    setShowMessageNotification(true);

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      setShowMessageNotification(false);
    }, 5000);
  };

  // Demo auto notification disabled per UX cleanup
  useEffect(() => {
    return () => {};
  }, []);

  // Set up global function for opening route modal from other components
  useEffect(() => {
    window.openRouteModal = (shipId) => {
      setModalParameters({ shipId: shipId || selectedShip });
      setActiveModal('show_route');
    };

    return () => {
      delete window.openRouteModal;
    };
  }, [selectedShip]);

  // Reset warned ships when selected ship changes
  useEffect(() => {
    setWarnedShips(new Set());
    setCollisionWarnings([]);
    setShowCollisionWarning(false);
  }, [selectedShip]);

  // Collision detection system - check for nearby ships
  useEffect(() => {
    if (!selectedShip) return;

    const checkCollisionRisk = async () => {
      try {
        const response = await axios.get(`${API_BASE}/api/eum/ships/realtime/demo`);
        const allShips = response.data;

        // Convert selected ship ID to devId format
        let myDevId;
        if (selectedShip.startsWith('EUM')) {
          const shipNumber = selectedShip.replace('EUM', '');
          myDevId = parseInt(shipNumber, 10);
        } else if (selectedShip.startsWith('SHIP')) {
          const shipNumber = selectedShip.replace('SHIP', '');
          myDevId = parseInt(shipNumber, 10);
        } else if (selectedShip.startsWith('선박')) {
          const shipNumber = selectedShip.replace('선박', '');
          myDevId = parseInt(shipNumber, 10);
        }

        // Find my ship's position
        const myShip = allShips.find(ship => ship.devId === myDevId);
        if (!myShip) return;

        // Calculate distances to other ships
        const warnings = [];
        const DANGER_DISTANCE_NM = 0.05; // 0.05 nautical miles danger zone (매우 타이트하게)
        const WARNING_DISTANCE_NM = 0.1; // 0.1 nautical mile warning zone (매우 타이트하게)
        const SAFE_DISTANCE_NM = 0.15; // 0.15 nautical miles - safe distance to reset warning

        const newWarnings = [];
        const shipsToRemoveFromWarned = [];

        allShips.forEach(ship => {
          if (ship.devId === myDevId) return; // Skip self

          // Calculate distance using Haversine formula
          const R = 3440.065; // Earth radius in nautical miles
          const dLat = (ship.lati - myShip.lati) * Math.PI / 180;
          const dLon = (ship.longi - myShip.longi) * Math.PI / 180;
          const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                    Math.cos(myShip.lati * Math.PI / 180) * Math.cos(ship.lati * Math.PI / 180) *
                    Math.sin(dLon/2) * Math.sin(dLon/2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
          const distance = R * c;

          // Check if this ship has already been warned
          const shipKey = `${myDevId}-${ship.devId}`;
          const alreadyWarned = warnedShips.has(shipKey);

          // If ship is now at safe distance, remove from warned list
          if (distance > SAFE_DISTANCE_NM && alreadyWarned) {
            shipsToRemoveFromWarned.push(shipKey);
          } else if (distance < DANGER_DISTANCE_NM && !alreadyWarned) {
            warnings.push({
              shipId: ship.devId,
              shipName: `선박${String(ship.devId).padStart(3, '0')}`,
              distance: distance.toFixed(2),
              level: 'danger',
              shipKey: shipKey,
              alreadyWarned: false
            });
            newWarnings.push(shipKey);
          } else if (distance < WARNING_DISTANCE_NM && !alreadyWarned) {
            warnings.push({
              shipId: ship.devId,
              shipName: `선박${String(ship.devId).padStart(3, '0')}`,
              distance: distance.toFixed(2),
              level: 'warning',
              shipKey: shipKey,
              alreadyWarned: false
            });
            newWarnings.push(shipKey);
          }
        });

        // Remove ships that are now at safe distance from warned list
        if (shipsToRemoveFromWarned.length > 0) {
          setWarnedShips(prev => {
            const newSet = new Set(prev);
            shipsToRemoveFromWarned.forEach(key => newSet.delete(key));
            return newSet;
          });
        }

        // Sort by distance
        warnings.sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance));

        // Set collision warnings (these are only NEW warnings, not already warned)
        setCollisionWarnings(warnings);

        // Update warned ships set and show warning only if there are new warnings
        if (newWarnings.length > 0) {
          setWarnedShips(prev => {
            const newSet = new Set(prev);
            newWarnings.forEach(key => newSet.add(key));
            return newSet;
          });
          setShowCollisionWarning(true);
        }
      } catch (error) {
        console.error('Failed to check collision risk:', error);
      }
    };

    // Check immediately and then every 5 seconds
    checkCollisionRisk();
    const interval = setInterval(checkCollisionRisk, 5000);

    return () => clearInterval(interval);
  }, [selectedShip, warnedShips]);

  return (
    <div className="chatbot-container">
      {/* VTS Navigation Button - Styled like Dashboard Chatbot Button */}
      <Link
        to="/"
        style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          backgroundColor: 'white',
          color: '#333',
          padding: '12px 20px',
          borderRadius: '25px',
          textDecoration: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          fontSize: '14px',
          fontWeight: '500',
          zIndex: 1000,
          transition: 'all 0.3s ease',
          cursor: 'pointer'
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.2)';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
        }}
      >
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
              <p>이름: {shipInfo.name}</p>
              <p>유형: {shipInfo.type}</p>
              <p>
                크기: {
                  shipInfo.length !== undefined && shipInfo.length !== null && !isNaN(parseFloat(shipInfo.length))
                    ? parseFloat(shipInfo.length).toFixed(2)
                    : 'N/A'
                }m × {
                  shipInfo.breath !== undefined && shipInfo.breath !== null && !isNaN(parseFloat(shipInfo.breath))
                    ? parseFloat(shipInfo.breath).toFixed(2)
                    : 'N/A'
                }m
              </p>
              <p>모항: {shipInfo.pol || '구룡포항'}</p>
              <p>총톤수: {shipInfo.gt !== undefined && shipInfo.gt !== null && !isNaN(parseFloat(shipInfo.gt)) ? parseFloat(shipInfo.gt).toFixed(2) : 'N/A'}톤</p>
            </div>
          )}
        </div>

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

          {/* Message Notification - Consistent Modal Style */}
          {showMessageNotification && messageNotification && (
            <>
              {/* Backdrop */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: 'rgba(0, 0, 0, 0.6)',
                  zIndex: 1999,
                  backdropFilter: 'blur(5px)'
                }}
                onClick={() => setShowMessageNotification(false)}
              />

              {/* Notification Modal */}
              <div
                className="message-notification"
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  background: 'rgba(30, 30, 30, 0.9)',
                  backdropFilter: 'blur(20px)',
                  borderRadius: '20px',
                  padding: '16px',
                  boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
                  zIndex: 2000,
                  width: '90%',
                  maxWidth: '320px',
                  animation: 'fadeIn 0.3s ease',
                  textAlign: 'left',
                  border: '1px solid rgba(255, 255, 255, 0.1)'
                }}
              >
                <div style={{ color: 'rgba(255, 255, 255, 0.85)', fontSize: '14px', marginBottom: '12px' }}>
                  <div style={{ marginBottom: '6px' }}>{messageNotification.sender}</div>
                  <div style={{ background: 'rgba(255, 255, 255, 0.08)', padding: '12px', borderRadius: '10px' }}>
                    {messageNotification.message}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                  <button
                    onClick={() => {
                      setActiveModal('receive_messages');
                      setShowMessageNotification(false);
                    }}
                    style={{
                      width: '100%',
                      padding: '14px',
                      background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.3) 0%, rgba(118, 75, 162, 0.3) 100%)',
                      color: 'white',
                      border: '1px solid rgba(102, 126, 234, 0.5)',
                      borderRadius: '12px',
                      fontSize: '0.95rem',
                      fontWeight: '500',
                      cursor: 'pointer',
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                    }}
                    onMouseOver={(e) => (
                      e.target.style.background = 'linear-gradient(135deg, rgba(102, 126, 234, 0.4) 0%, rgba(118, 75, 162, 0.4) 100%)',
                      e.target.style.transform = 'translateY(-2px)',
                      e.target.style.boxShadow = '0 5px 15px rgba(102, 126, 234, 0.3)'
                    )}
                    onMouseOut={(e) => (
                      e.target.style.background = 'linear-gradient(135deg, rgba(102, 126, 234, 0.3) 0%, rgba(118, 75, 162, 0.3) 100%)',
                      e.target.style.transform = 'translateY(0)',
                      e.target.style.boxShadow = 'none'
                    )}
                  >
                    열기
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Collision Warning Alert */}
          {showCollisionWarning && collisionWarnings.length > 0 && (
            <div style={{
              position: 'absolute',
              top: '80px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 2000,
              animation: 'fadeIn 0.3s ease'
            }}>
              <div style={{
                background: collisionWarnings[0].level === 'danger'
                  ? 'rgba(255, 0, 0, 0.9)'
                  : 'rgba(255, 165, 0, 0.9)',
                borderRadius: '15px',
                padding: '12px 20px',
                backdropFilter: 'blur(10px)',
                boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                minWidth: '250px',
                textAlign: 'center'
              }}>
                <div style={{
                  color: 'white',
                  fontWeight: 'bold',
                  fontSize: '14px',
                  marginBottom: '8px'
                }}>
                  ⚠️ 충돌 위험 경고
                </div>
                {collisionWarnings.slice(0, 2).map((warning, index) => (
                  <div key={index} style={{
                    color: 'white',
                    fontSize: '12px',
                    marginTop: '4px',
                    opacity: 0.95
                  }}>
                    {warning.shipName}와(과) {warning.distance}해리 거리
                    {warning.level === 'danger' && ' (위험!)'}
                  </div>
                ))}
                {collisionWarnings.length > 2 && (
                  <div style={{
                    color: 'white',
                    fontSize: '11px',
                    marginTop: '4px',
                    opacity: 0.8
                  }}>
                    외 {collisionWarnings.length - 2}척 추가 경고
                  </div>
                )}
                <button
                  onClick={() => {
                    setShowCollisionWarning(false);
                    // 확인 버튼을 누르면 현재 경고를 숨기지만, warnedShips는 유지
                    // 이미 경고한 선박들은 다시 경고하지 않음
                  }}
                  style={{
                    marginTop: '8px',
                    padding: '4px 12px',
                    background: 'rgba(255, 255, 255, 0.2)',
                    border: '1px solid rgba(255, 255, 255, 0.4)',
                    borderRadius: '8px',
                    color: 'white',
                    fontSize: '11px',
                    cursor: 'pointer'
                  }}
                >
                  확인
                </button>
              </div>
            </div>
          )}

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
                disabled={isProcessing}
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
            <button
              onClick={() => handleFeatureSelect('list_features')}
              className="debug-button"
            >
              기능 목록
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatBot;