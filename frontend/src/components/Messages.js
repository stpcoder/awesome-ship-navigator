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
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
      <div style={{ marginBottom: '1rem' }}>
        <h3 style={{ margin: 0 }}>
          채팅 메시지 {unreadCount > 0 && <span style={{ color: '#ff6b6b' }}>({unreadCount})</span>}
        </h3>
      </div>

      {/* Ship selector */}
      <div style={{ marginBottom: '1rem' }}>
        <select
          value={selectedChatShip}
          onChange={(e) => setSelectedChatShip(e.target.value)}
          style={{
            width: '100%',
            padding: '0.6rem',
            background: 'rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '10px',
            fontSize: '0.9rem',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            transition: 'all 0.3s ease'
          }}
        >
          <option value="all">전체 선박</option>
          <option value="control_center">관제센터</option>
          {ships.map(ship => (
            <option key={ship.shipId} value={ship.shipId}>
              {ship.name || ship.shipId}
            </option>
          ))}
        </select>
      </div>

      {/* Messages display */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        marginBottom: '1rem',
        padding: '0.5rem',
        background: 'rgba(255, 255, 255, 0.05)',
        borderRadius: '10px',
        border: '1px solid rgba(255, 255, 255, 0.1)'
      }}>
        {messages.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>메시지가 없습니다</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {messages.map(msg => (
              <div
                key={msg.id}
                style={{
                  padding: '0.8rem',
                  background: msg.sender_id === 'control_center'
                    ? 'rgba(65, 105, 225, 0.1)'
                    : 'rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  borderLeft: msg.is_read
                    ? '3px solid rgba(255, 255, 255, 0.3)'
                    : '3px solid #4169E1',
                  cursor: !msg.is_read ? 'pointer' : 'default',
                  transition: 'all 0.3s ease'
                }}
                onClick={() => !msg.is_read && markMessagesAsRead([msg.id])}
              >
                <div style={{
                  fontSize: '0.8rem',
                  color: 'var(--text-secondary)',
                  marginBottom: '0.25rem',
                  display: 'flex',
                  justifyContent: 'space-between'
                }}>
                  <span style={{ fontWeight: msg.is_read ? 'normal' : '600' }}>
                    {msg.sender_name} → {msg.recipient_name}
                  </span>
                  <span style={{ fontSize: '0.75rem' }}>
                    {new Date(msg.created_at).toLocaleString('ko-KR', {
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>
                <div style={{
                  color: 'var(--text-primary)',
                  fontSize: '0.9rem',
                  fontWeight: msg.is_read ? 'normal' : '500'
                }}>
                  {msg.message}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Message input */}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <input
          type="text"
          value={messageInput}
          onChange={(e) => setMessageInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="메시지를 입력하세요..."
          style={{
            flex: 1,
            padding: '0.6rem',
            background: 'rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '8px',
            fontSize: '0.9rem',
            color: 'var(--text-primary)',
            transition: 'all 0.3s ease'
          }}
        />
        <button
          onClick={sendMessage}
          style={{
            padding: '0.6rem 1.2rem',
            background: 'rgba(255, 255, 255, 0.15)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '0.9rem',
            fontWeight: '500',
            cursor: 'pointer',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            transition: 'all 0.3s ease'
          }}
          onMouseEnter={(e) => {
            e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
          }}
          onMouseLeave={(e) => {
            e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.15)';
          }}
        >
          전송
        </button>
      </div>
    </div>
  );
};

export default Messages;