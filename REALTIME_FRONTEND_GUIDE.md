# Real-time WebSocket Integration - Frontend Guide

## Overview
The backend now supports **real-time notifications** using WebSockets. When STAFF makes sales, ADMIN and SUPER_ADMIN receive instant updates without page refresh.

## 🚀 Quick Setup

### 1. Install Socket.io Client
```bash
npm install socket.io-client
```

### 2. Basic React Integration
```javascript
import { useEffect, useState } from 'react';
import io from 'socket.io-client';

function Dashboard() {
  const [socket, setSocket] = useState(null);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    // Get JWT token (however you store it)
    const token = localStorage.getItem('accessToken');
    
    // Connect to WebSocket
    const newSocket = io('http://localhost:3000', {
      auth: { token }
    });

    newSocket.on('connect', () => {
      console.log('✅ Real-time connection established');
    });

    // Listen for new sales (STAFF → ADMIN/SUPER_ADMIN)
    newSocket.on('transaction_created', (data) => {
      console.log('🔔 New sale created:', data);
      
      // Add notification
      const notification = `New sale: ${data.data.invoiceNumber} by ${data.actorEmail}`;
      setNotifications(prev => [notification, ...prev]);
      
      // Update your sales dashboard here
      // updateSalesDashboard(data.data);
    });

    // Listen for new clients
    newSocket.on('client_created', (data) => {
      console.log('🔔 New client registered:', data);
      const notification = `New client: ${data.data.name}`;
      setNotifications(prev => [notification, ...prev]);
    });

    // Listen for new products  
    newSocket.on('product_created', (data) => {
      console.log('🔔 New product created:', data);
      const notification = `New product: ${data.data.name}`;
      setNotifications(prev => [notification, ...prev]);
    });

    newSocket.on('connect_error', (error) => {
      console.error('❌ WebSocket connection failed:', error);
    });

    setSocket(newSocket);

    // Cleanup when component unmounts
    return () => newSocket.close();
  }, []);

  return (
    <div>
      <h1>Dashboard</h1>
      
      {/* Real-time notifications */}
      <div>
        <h3>Real-time Notifications</h3>
        {notifications.map((notif, index) => (
          <div key={index} style={{padding: '10px', background: '#f0f0f0', margin: '5px'}}>
            {notif}
          </div>
        ))}
      </div>
      
      {/* Your existing dashboard content */}
    </div>
  );
}

export default Dashboard;
```

## 🎯 Key Events to Listen For

### 1. New Sales (Most Important!)
```javascript
socket.on('transaction_created', (data) => {
  // When STAFF makes a sale, ADMIN and SUPER_ADMIN get this
  console.log('New sale:', data.data.invoiceNumber);
  console.log('Made by:', data.actorEmail);
  console.log('Amount:', data.data.totalPrice);
});
```

### 2. New Clients
```javascript
socket.on('client_created', (data) => {
  // When STAFF registers a client
  console.log('New client:', data.data.name);
});
```

### 3. New Products
```javascript
socket.on('product_created', (data) => {
  // When ADMIN creates a product
  console.log('New product:', data.data.name);
});
```

## 📊 Event Data Structure

When you receive an event, the data looks like this:

```javascript
{
  "action": "created",
  "resourceType": "transaction", // or "client", "product", etc.
  "resourceId": "68a7d6c791119fd80e5c1100",
  "data": {
    // The actual transaction/client/product data
    "invoiceNumber": "INV-2025-001",
    "totalPrice": 51000,
    // ... more fields
  },
  "actorEmail": "jonathan@gmail.com", // Who performed the action
  "actorRole": "STAFF",               // Their role
  "branchId": "686bb9d065966861bfcc117b",
  "branch": "Lagos Branch",
  "timestamp": "2025-08-22T03:32:39.000Z"
}
```

## 🛡️ Error Handling

```javascript
socket.on('connect_error', (error) => {
  console.error('Connection failed:', error);
  
  if (error.message.includes('Authentication')) {
    // JWT token expired - redirect to login
    window.location.href = '/login';
  }
});

socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
  
  if (reason === 'io server disconnect') {
    // Server restarted - will auto-reconnect
    console.log('Server restarted, reconnecting...');
  }
});
```

## 🎨 UI Integration Examples

### Show Toast Notifications
```javascript
socket.on('transaction_created', (data) => {
  // Using react-toastify or similar
  toast.success(`New sale: ${data.data.invoiceNumber}`);
});
```

### Update State/Context
```javascript
socket.on('transaction_created', (data) => {
  // Update your sales state
  setSales(prevSales => [data.data, ...prevSales]);
  
  // Or dispatch to Redux/Zustand
  dispatch(addSale(data.data));
});
```

### Badge/Counter Updates
```javascript
const [newSalesCount, setNewSalesCount] = useState(0);

socket.on('transaction_created', (data) => {
  setNewSalesCount(prev => prev + 1);
});
```

## ⚙️ Configuration

### Development
```javascript
const socket = io('http://localhost:3000', {
  auth: { token }
});
```

### Production
```javascript
const socket = io('https://your-api-domain.com', {
  auth: { token }
});
```

## 🚨 Important Notes

1. **JWT Token**: Use the same token from your login API
2. **Connection**: Only connect when user is on dashboard pages (not login page)
3. **Cleanup**: Always close socket when component unmounts
4. **Roles**: Only ADMIN and SUPER_ADMIN receive STAFF sale notifications
5. **Performance**: Socket.io handles reconnection automatically

## 🧪 Testing

### Test Connection
```javascript
// Add this to test if WebSocket is working
socket.on('connect', () => {
  socket.emit('ping', 'test', (response) => {
    console.log('✅ WebSocket working:', response);
  });
});
```

### Check Server Logs
When you make a sale, server logs should show:
```
✅ Real-time transaction event emitted
Emitted transaction_created to rooms: admin_xxx, super_admin
```

## 🎯 Result

**Before**: Admin had to refresh page to see new sales ❌  
**After**: Admin sees sales instantly when STAFF creates them ✅
