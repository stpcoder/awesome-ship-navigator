import React, { useState } from 'react';
import axios from 'axios';

const ReportGenerator = ({ ships, sosAlerts, messages, simulationRoutes }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [showReport, setShowReport] = useState(false);

  const generateReport = async () => {
    setIsGenerating(true);

    try {
      // Get today's date
      const today = new Date();
      const dateStr = today.toISOString().split('T')[0];

      // Call backend API to generate comprehensive report
      const response = await axios.get(`http://localhost:8000/api/daily-report?date=${dateStr}`);

      const report = response.data;

      // Add client-side data that backend might not have
      report.client_data = {
        current_ship_count: ships.length,
        active_sos_alerts: sosAlerts.filter(alert => alert.status === 'active').length,
        recent_messages: messages.slice(0, 10),
        simulation_routes: simulationRoutes
      };

      setReportData(report);
      setShowReport(true);
    } catch (error) {
      console.error('Error generating report:', error);
      // Generate a basic report from client-side data if API fails
      generateClientSideReport();
    } finally {
      setIsGenerating(false);
    }
  };

  const generateClientSideReport = () => {
    const today = new Date();
    const report = {
      date: today.toLocaleDateString('ko-KR'),
      time: today.toLocaleTimeString('ko-KR'),
      ship_status: {
        total_ships: ships.length,
        active_ships: ships.filter(s => s.status === 'active' || s.status === 'sailing').length,
        docked_ships: ships.filter(s => s.status === 'docked').length
      },
      emergency_summary: {
        total_sos_alerts: sosAlerts.length,
        active_alerts: sosAlerts.filter(a => a.status === 'active').length,
        resolved_alerts: sosAlerts.filter(a => a.status === 'resolved').length
      },
      communication_summary: {
        total_messages: messages.length,
        sent_messages: messages.filter(m => m.sender_id === 'control_center').length,
        received_messages: messages.filter(m => m.recipient_id === 'control_center').length
      },
      schedule_summary: {
        planned_departures: simulationRoutes.length,
        completed_routes: 0 // Would need backend data for this
      }
    };

    setReportData(report);
    setShowReport(true);
  };

  const downloadReport = () => {
    if (!reportData) return;

    // Create formatted text content
    let content = `==================================\n`;
    content += `일일 운항 보고서\n`;
    content += `==================================\n\n`;
    content += `날짜: ${reportData.date || new Date().toLocaleDateString('ko-KR')}\n`;
    content += `시간: ${reportData.time || new Date().toLocaleTimeString('ko-KR')}\n\n`;

    content += `[선박 현황]\n`;
    content += `총 선박 수: ${reportData.ship_status?.total_ships || 0}\n`;
    content += `운항 중: ${reportData.ship_status?.active_ships || 0}\n`;
    content += `정박 중: ${reportData.ship_status?.docked_ships || 0}\n\n`;

    content += `[긴급 상황]\n`;
    content += `총 SOS 알림: ${reportData.emergency_summary?.total_sos_alerts || 0}\n`;
    content += `활성 알림: ${reportData.emergency_summary?.active_alerts || 0}\n`;
    content += `해결된 알림: ${reportData.emergency_summary?.resolved_alerts || 0}\n\n`;

    content += `[통신 내역]\n`;
    content += `총 메시지: ${reportData.communication_summary?.total_messages || 0}\n`;
    content += `발신: ${reportData.communication_summary?.sent_messages || 0}\n`;
    content += `수신: ${reportData.communication_summary?.received_messages || 0}\n\n`;

    if (reportData.departures?.length > 0) {
      content += `[출항 스케줄]\n`;
      reportData.departures.forEach(dep => {
        content += `${dep.ship_name}: ${dep.departure_time} 출발 → ${dep.arrival_time} 도착\n`;
      });
      content += '\n';
    }

    if (reportData.incidents?.length > 0) {
      content += `[사건 기록]\n`;
      reportData.incidents.forEach(incident => {
        content += `• ${incident.time}: ${incident.description}\n`;
      });
      content += '\n';
    }

    content += `==================================\n`;
    content += `보고서 생성 완료\n`;

    // Create and download file
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `daily_report_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '1rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>일일 보고서 생성</h3>

        <button
          onClick={generateReport}
          disabled={isGenerating}
          className="modern-button button-primary"
          style={{ width: '100%', marginBottom: '1rem' }}
        >
          {isGenerating ? '보고서 생성 중...' : '보고서 생성'}
        </button>

        {showReport && reportData && (
          <div style={{
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            borderRadius: '8px',
            padding: '1rem',
            marginTop: '1rem',
            maxHeight: 'calc(100vh - 300px)',
            overflowY: 'auto'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem'
            }}>
              <h4 style={{ margin: 0 }}>일일 운항 보고서</h4>
              <button
                onClick={() => setShowReport(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#fff',
                  fontSize: '1.5rem',
                  cursor: 'pointer'
                }}
              >
                ×
              </button>
            </div>

            <div style={{ fontSize: '0.9rem', lineHeight: '1.6' }}>
              <div style={{ marginBottom: '1rem' }}>
                <strong>날짜:</strong> {reportData.date || new Date().toLocaleDateString('ko-KR')}<br />
                <strong>시간:</strong> {reportData.time || new Date().toLocaleTimeString('ko-KR')}
              </div>

              <div style={{
                borderTop: '1px solid rgba(255,255,255,0.2)',
                paddingTop: '0.5rem',
                marginBottom: '1rem'
              }}>
                <h5 style={{ color: '#4fc3f7' }}>선박 현황</h5>
                <div style={{ paddingLeft: '1rem' }}>
                  총 선박: {reportData.ship_status?.total_ships || 0}척<br />
                  운항 중: {reportData.ship_status?.active_ships || 0}척<br />
                  정박 중: {reportData.ship_status?.docked_ships || 0}척
                </div>
              </div>

              <div style={{
                borderTop: '1px solid rgba(255,255,255,0.2)',
                paddingTop: '0.5rem',
                marginBottom: '1rem'
              }}>
                <h5 style={{ color: '#ff6b6b' }}>긴급 상황</h5>
                <div style={{ paddingLeft: '1rem' }}>
                  총 SOS 알림: {reportData.emergency_summary?.total_sos_alerts || 0}건<br />
                  활성 알림: {reportData.emergency_summary?.active_alerts || 0}건<br />
                  해결된 알림: {reportData.emergency_summary?.resolved_alerts || 0}건
                </div>
              </div>

              <div style={{
                borderTop: '1px solid rgba(255,255,255,0.2)',
                paddingTop: '0.5rem',
                marginBottom: '1rem'
              }}>
                <h5 style={{ color: '#66bb6a' }}>통신 내역</h5>
                <div style={{ paddingLeft: '1rem' }}>
                  총 메시지: {reportData.communication_summary?.total_messages || 0}건<br />
                  발신: {reportData.communication_summary?.sent_messages || 0}건<br />
                  수신: {reportData.communication_summary?.received_messages || 0}건
                </div>
              </div>

              {reportData.departures && reportData.departures.length > 0 && (
                <div style={{
                  borderTop: '1px solid rgba(255,255,255,0.2)',
                  paddingTop: '0.5rem',
                  marginBottom: '1rem'
                }}>
                  <h5 style={{ color: '#ffa726' }}>출항 스케줄</h5>
                  <div style={{ paddingLeft: '1rem' }}>
                    {reportData.departures.map((dep, idx) => (
                      <div key={idx} style={{ marginBottom: '0.3rem' }}>
                        {dep.ship_name}: {new Date(dep.departure_time).toLocaleTimeString('ko-KR')} 출발
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={downloadReport}
              className="modern-button"
              style={{ width: '100%', marginTop: '1rem' }}
            >
              보고서 다운로드 (.txt)
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportGenerator;