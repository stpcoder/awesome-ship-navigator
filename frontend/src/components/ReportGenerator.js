import React, { useState } from 'react';
import axios from 'axios';
import jsPDF from 'jspdf';
// html2canvas removed - using text-based PDF generation

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
      departures: simulationRoutes || [],
      schedule_summary: {
        planned_departures: simulationRoutes?.length || 0,
        completed_routes: 0 // Would need backend data for this
      }
    };

    setReportData(report);
    setShowReport(true);
  };

  const downloadReportPDF = async () => {
    if (!reportData) return;

    try {
      // Create PDF - jsPDF doesn't natively support Korean, so we'll use Unicode escape sequences
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      // PDF settings
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 20;
      const lineHeight = 8;
      let yPosition = margin;

      // Helper function to add text (using basic ASCII for Korean compatibility)
      const addText = (text, fontSize = 10, isBold = false) => {
        pdf.setFontSize(fontSize);
        if (isBold) {
          pdf.setFont('helvetica', 'bold');
        } else {
          pdf.setFont('helvetica', 'normal');
        }

        // For Korean text, we'll use English labels for now
        const lines = pdf.splitTextToSize(text, pageWidth - 2 * margin);

        lines.forEach(line => {
          if (yPosition > pageHeight - margin) {
            pdf.addPage();
            yPosition = margin;
          }
          // Convert Korean text to escaped format for display
          const displayText = line.replace(/[\u3131-\uD79D]/g, function(match) {
            return '\\u' + ('0000' + match.charCodeAt(0).toString(16)).slice(-4);
          });

          pdf.text(line, margin, yPosition);
          yPosition += lineHeight;
        });
      };

      // Add title
      pdf.setFontSize(18);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Daily Operation Report', pageWidth / 2, yPosition, { align: 'center' });
      yPosition += lineHeight * 2;

      // Add report info
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text('[Report Information]', margin, yPosition);
      yPosition += lineHeight;
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Date: ${reportData.date || new Date().toLocaleDateString('ko-KR')}`, margin, yPosition);
      yPosition += lineHeight;
      pdf.text(`Time: ${reportData.time || new Date().toLocaleTimeString('ko-KR')}`, margin, yPosition);
      yPosition += lineHeight * 1.5;

      // Add ship status
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text('[Ship Status]', margin, yPosition);
      yPosition += lineHeight;
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Total Ships: ${reportData.ship_status?.total_ships || 0}`, margin, yPosition);
      yPosition += lineHeight;
      pdf.text(`Active Ships: ${reportData.ship_status?.active_ships || 0}`, margin, yPosition);
      yPosition += lineHeight;
      pdf.text(`Docked Ships: ${reportData.ship_status?.docked_ships || 0}`, margin, yPosition);
      yPosition += lineHeight * 1.5;

      // Add emergency summary
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text('[Emergency Status]', margin, yPosition);
      yPosition += lineHeight;
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Total SOS Alerts: ${reportData.emergency_summary?.total_sos_alerts || 0}`, margin, yPosition);
      yPosition += lineHeight;
      pdf.text(`Active Alerts: ${reportData.emergency_summary?.active_alerts || 0}`, margin, yPosition);
      yPosition += lineHeight;
      pdf.text(`Resolved Alerts: ${reportData.emergency_summary?.resolved_alerts || 0}`, margin, yPosition);
      yPosition += lineHeight * 1.5;

      // Add ship plans
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text('[Ship Schedule]', margin, yPosition);
      yPosition += lineHeight;
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Total Plans: ${reportData.departures?.length || 10}`, margin, yPosition);
      yPosition += lineHeight;

      if (reportData.departures && reportData.departures.length > 0) {
        reportData.departures.slice(0, 5).forEach(dep => {
          const depTime = new Date(dep.departure_time).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
          const arrTime = new Date(dep.arrival_time).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
          pdf.text(`  - ${dep.ship_name}: ${depTime} -> ${arrTime}`, margin, yPosition);
          yPosition += lineHeight;
        });
        if (reportData.departures.length > 5) {
          pdf.text(`  ... and ${reportData.departures.length - 5} more`, margin, yPosition);
          yPosition += lineHeight;
        }
      }

      // Add incidents if exists
      if (reportData.incidents && reportData.incidents.length > 0) {
        yPosition += lineHeight;
        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'bold');
        pdf.text('[Incident Records]', margin, yPosition);
        yPosition += lineHeight;
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'normal');
        reportData.incidents.forEach(incident => {
          const incidentText = `  - ${incident.time} - ${incident.ship_name}: ${incident.description} (${incident.status})`;
          const lines = pdf.splitTextToSize(incidentText, pageWidth - 2 * margin);
          lines.forEach(line => {
            if (yPosition > pageHeight - margin) {
              pdf.addPage();
              yPosition = margin;
            }
            pdf.text(line, margin, yPosition);
            yPosition += lineHeight;
          });
        });
      }

      // Generate filename with date
      const today = new Date();
      const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;

      // Save PDF
      pdf.save(`${dateStr}_report.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('PDF 생성 중 오류가 발생했습니다.');
    }
  };

  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {!showReport ? (
        <div style={{ padding: '1rem' }}>
          <h3 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>일일 보고서 생성</h3>

          <button
            onClick={generateReport}
            disabled={isGenerating}
            className="modern-button button-primary"
            style={{ width: '100%', marginBottom: '1rem' }}
          >
            {isGenerating ? '보고서 생성 중...' : '보고서 생성'}
          </button>
        </div>
      ) : (
        <div style={{ padding: '1rem', height: '100%', overflowY: 'auto' }}>
          <div style={{ marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>일일 운항 보고서</h3>
          </div>

          {reportData && (
            <div id="report-content">
              <div style={{ marginBottom: '0.75rem', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ fontWeight: '600', marginBottom: '0.3rem', color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                  보고서 정보
                </div>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                  날짜: {reportData.date || new Date().toLocaleDateString('ko-KR')}<br />
                  시간: {reportData.time || new Date().toLocaleTimeString('ko-KR')}
                </div>
              </div>

              <div style={{ marginBottom: '0.75rem', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ fontWeight: '600', marginBottom: '0.3rem', color: '#4fc3f7', fontSize: '0.95rem' }}>
                  선박 현황
                </div>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                  총 선박: {reportData.ship_status?.total_ships || 0}척<br />
                  운항 중: {reportData.ship_status?.active_ships || 0}척<br />
                  정박 중: {reportData.ship_status?.docked_ships || 0}척
                </div>
              </div>

              <div style={{ marginBottom: '0.75rem', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ fontWeight: '600', marginBottom: '0.3rem', color: '#ff6b6b', fontSize: '0.95rem' }}>
                  긴급 상황
                </div>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                  총 SOS 알림: {reportData.emergency_summary?.total_sos_alerts || 0}건<br />
                  활성 알림: {reportData.emergency_summary?.active_alerts || 0}건<br />
                  해결된 알림: {reportData.emergency_summary?.resolved_alerts || 0}건
                </div>
              </div>


              <div style={{ marginBottom: '0.75rem', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ fontWeight: '600', marginBottom: '0.3rem', color: '#ffa726', fontSize: '0.95rem' }}>
                  선박 계획
                </div>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                  총 계획: {reportData.departures?.length || 0}건
                </div>
              </div>

              {reportData.departures && reportData.departures.length > 0 && (
                <div style={{ marginBottom: '0.75rem', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ fontWeight: '600', marginBottom: '0.3rem', color: '#ffa726', fontSize: '0.95rem' }}>
                    선박 운항 일정
                  </div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                    {reportData.departures.slice(0, 3).map((dep, idx) => (
                      <div key={idx} style={{ marginBottom: '0.3rem' }}>
                        {dep.ship_name}: {new Date(dep.departure_time).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} → {new Date(dep.arrival_time).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    ))}
                    {reportData.departures.length > 3 && (
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.3rem' }}>
                        ... 외 {reportData.departures.length - 3}개
                      </div>
                    )}
                  </div>
                </div>
              )}

              {reportData.incidents && reportData.incidents.length > 0 && (
                <div style={{ marginBottom: '0.75rem' }}>
                  <div style={{ fontWeight: '600', marginBottom: '0.3rem', color: '#e91e63', fontSize: '0.95rem' }}>
                    사건 기록
                  </div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                    {reportData.incidents.map((incident, idx) => (
                      <div key={idx} style={{ marginBottom: '0.3rem' }}>
                        • {incident.time} - {incident.ship_name}: {incident.description} ({incident.status})
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <button
            onClick={downloadReportPDF}
            className="modern-button"
            style={{ width: '100%' }}
          >
            보고서 다운로드 (PDF)
          </button>
        </div>
      )}
    </div>
  );
};

export default ReportGenerator;