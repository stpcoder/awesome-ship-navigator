import React, { useState } from 'react';

const Messages = ({
  messages,
  unreadCount,
  selectedChatShip,
  setSelectedChatShip,
  messageInput,
  setMessageInput,
  sendMessage,
  markMessagesAsRead,
  ships
}) => {
  return (
    <div className="panel" style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      <h3 style={{
        marginBottom: '1rem'
      }}>
        채팅 메시지 {unreadCount > 0 && <span style={{ color: '#ff6b6b' }}>({unreadCount})</span>}
      </h3>

      <div style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        paddingRight: '5px'
      }}>
        {messages.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem 0' }}>메시지가 없습니다</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
            {messages.slice(0, 3).map(msg => (
              <div
                key={msg.id}
                className={`message-item ${msg.sender_id === 'control_center' ? 'from-control' : ''} ${!msg.is_read ? 'unread' : ''}`}
                onClick={() => !msg.is_read && markMessagesAsRead([msg.id])}
              >
                <div style={{
                  color: 'var(--text-primary)',
                  fontSize: '0.9rem',
                  fontWeight: msg.is_read ? 'normal' : '500',
                  marginBottom: '0.5rem',
                  lineHeight: '1.4'
                }}>
                  {msg.message}
                </div>
                <div style={{
                  fontSize: '0.8rem',
                  color: 'var(--text-secondary)',
                  fontWeight: msg.is_read ? 'normal' : '500',
                  marginBottom: '0.3rem'
                }}>
                  {msg.sender_name} → {msg.recipient_name}
                </div>
                <div style={{
                  fontSize: '0.75rem',
                  color: 'var(--text-secondary)',
                  opacity: 0.8
                }}>
                  {new Date(msg.created_at).toLocaleString('ko-KR', {
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Ship selector and input inside scrollable area */}
        <div style={{
          marginTop: '1rem',
          paddingTop: '1rem',
          borderTop: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          <select
            value={selectedChatShip}
            onChange={(e) => setSelectedChatShip(e.target.value)}
            className="modern-select"
            style={{ marginBottom: '0.5rem', width: '100%' }}
          >
            <option value="all">전체 선박</option>
            <option value="control_center">관제센터</option>
            {ships.map(ship => (
              <option key={ship.shipId} value={ship.shipId}>
                {ship.name || ship.shipId}
              </option>
            ))}
          </select>

          <div style={{
            display: 'flex',
            gap: '0.5rem'
          }}>
            <input
              type="text"
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
              placeholder="메시지를 입력하세요..."
              className="modern-input"
              style={{ flex: 1 }}
            />
            <button
              onClick={sendMessage}
              className="modern-button button-primary"
              style={{ width: 'auto' }}
            >
              전송
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Messages;