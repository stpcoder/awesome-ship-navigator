import React, { useEffect, useState, useRef } from 'react';
import Chart from 'chart.js/auto';

const EntryExitStats = ({ visible, onClose }) => {
  const [statsData, setStatsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  useEffect(() => {
    if (visible) {
      fetchStats();
    }
  }, [visible]);

  const fetchStats = async () => {
    setLoading(true);
    try {
      // Fetch from EUM API endpoint
      const response = await fetch('https://apis.pohang-eum.co.kr/lidar/realtime/recent/statics');
      const data = await response.json();
      setStatsData(data);
      updateChart(data);
    } catch (error) {
      console.error('Failed to fetch entry/exit statistics:', error);
      // Use mock data for development
      const mockData = {
        hours: Array.from({ length: 24 }, (_, i) => `${i}:00`),
        entries: Array.from({ length: 24 }, () => Math.floor(Math.random() * 10)),
        exits: Array.from({ length: 24 }, () => Math.floor(Math.random() * 10))
      };
      setStatsData(mockData);
      updateChart(mockData);
    }
    setLoading(false);
  };

  const updateChart = (data) => {
    if (!chartRef.current) return;

    // Destroy existing chart
    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    const ctx = chartRef.current.getContext('2d');
    chartInstance.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.hours || [],
        datasets: [
          {
            label: '입항',
            data: data.entries || [],
            backgroundColor: 'rgba(54, 162, 235, 0.6)',
            borderColor: 'rgba(54, 162, 235, 1)',
            borderWidth: 1,
            barThickness: 20
          },
          {
            label: '출항',
            data: data.exits || [],
            backgroundColor: 'rgba(255, 99, 132, 0.6)',
            borderColor: 'rgba(255, 99, 132, 1)',
            borderWidth: 1,
            barThickness: 20
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: {
              color: '#fff',
              font: {
                size: 12
              }
            }
          },
          title: {
            display: true,
            text: '최근 24시간 입출항 기록',
            color: '#fff',
            font: {
              size: 16,
              weight: 'bold'
            }
          }
        },
        scales: {
          x: {
            grid: {
              color: 'rgba(255, 255, 255, 0.1)'
            },
            ticks: {
              color: '#fff',
              font: {
                size: 10
              }
            }
          },
          y: {
            beginAtZero: true,
            grid: {
              color: 'rgba(255, 255, 255, 0.1)'
            },
            ticks: {
              color: '#fff',
              stepSize: 1,
              font: {
                size: 10
              }
            }
          }
        }
      }
    });
  };

  useEffect(() => {
    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, []);

  if (!visible) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      width: '450px',
      height: '350px',
      backgroundColor: 'rgba(0, 0, 0, 0.9)',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
      borderRadius: '15px',
      padding: '20px',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '15px'
      }}>
        <h3 style={{
          margin: 0,
          color: 'white',
          fontSize: '18px',
          fontWeight: 'bold'
        }}>
          입출항 통계
        </h3>
        <button
          onClick={onClose}
          style={{
            background: 'rgba(255, 255, 255, 0.2)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            color: 'white',
            borderRadius: '50%',
            width: '30px',
            height: '30px',
            fontSize: '16px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.3s ease'
          }}
          onMouseEnter={(e) => {
            e.target.style.background = 'rgba(255, 255, 255, 0.3)';
          }}
          onMouseLeave={(e) => {
            e.target.style.background = 'rgba(255, 255, 255, 0.2)';
          }}
        >
          ×
        </button>
      </div>

      {/* Chart Container */}
      <div style={{
        flex: 1,
        position: 'relative',
        minHeight: '250px'
      }}>
        {loading ? (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100%',
            color: 'white'
          }}>
            <div>Loading...</div>
          </div>
        ) : (
          <canvas ref={chartRef} style={{ width: '100%', height: '100%' }}></canvas>
        )}
      </div>
    </div>
  );
};

export default EntryExitStats;