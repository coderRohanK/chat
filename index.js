const express = require('express')
const cors = require('cors')

// Mock database for demo purposes
const mockUsers = new Map()
const mockMessages = new Map()

const app = express()
var http = require('http').createServer(app)
var io = require('socket.io')(http, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
})

app.use(cors())
app.use(express.json())

// Mock authentication middleware
app.use((req, res, next) => {
    const userId = req.get('userId')
    const installationId = req.get('installationId')

    if (userId && installationId) {
        const user = mockUsers.get(userId)
        if (user && user.installationId === installationId) {
            req.body.isAuthenticated = true
            req.body.userId = userId
        } else {
            req.body.isAuthenticated = false
        }
    } else {
        req.body.isAuthenticated = false
    }

    return next()
})

// Avatar images array
const avatarImages = [
    'https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg?auto=compress&cs=tinysrgb&w=150',
    'https://images.pexels.com/photos/415829/pexels-photo-415829.jpeg?auto=compress&cs=tinysrgb&w=150',
    'https://images.pexels.com/photos/1222271/pexels-photo-1222271.jpeg?auto=compress&cs=tinysrgb&w=150',
    'https://images.pexels.com/photos/1239291/pexels-photo-1239291.jpeg?auto=compress&cs=tinysrgb&w=150',
    'https://images.pexels.com/photos/1043471/pexels-photo-1043471.jpeg?auto=compress&cs=tinysrgb&w=150',
    'https://images.pexels.com/photos/1181686/pexels-photo-1181686.jpeg?auto=compress&cs=tinysrgb&w=150',
    'https://images.pexels.com/photos/1181690/pexels-photo-1181690.jpeg?auto=compress&cs=tinysrgb&w=150',
    'https://images.pexels.com/photos/1300402/pexels-photo-1300402.jpeg?auto=compress&cs=tinysrgb&w=150'
]

const getRandomAvatar = () => {
    return avatarImages[Math.floor(Math.random() * avatarImages.length)]
}

// User routes
app.post('/user', (req, res) => {
    const { expoPushToken, installationId } = req.body

    if (!installationId) {
        return res.status(200).send({
            status: 0,
            error: 'installationId is required'
        })
    }

    const userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
    const user = {
        _id: userId,
        expoPushToken: expoPushToken || 'none',
        acceptNotifications: true,
        installationId
    }

    mockUsers.set(userId, user)

    return res.status(200).send({
        status: 1,
        user
    })
})

app.get('/user/avatar', (req, res) => {
    return res.status(200).send({
        status: 1,
        avatar: getRandomAvatar()
    })
})

app.get('/user/avatar-thumbnails', (req, res) => {
    return res.status(200).send({
        status: 1,
        avatars: avatarImages
    })
})

app.patch('/user/reset', (req, res) => {
    const { isAuthenticated, userId } = req.body

    if (!isAuthenticated) {
        return res.status(200).send({
            status: 0,
            error: 'Unauthorized!'
        })
    }

    mockUsers.delete(userId)
    // Delete user messages
    for (let [key, message] of mockMessages) {
        if (message.to === userId || message.from === userId) {
            mockMessages.delete(key)
        }
    }

    return res.status(200).send({
        status: 1
    })
})

app.patch('/user/notifications', (req, res) => {
    const { isAuthenticated, userId, acceptNotifications } = req.body

    if (!isAuthenticated) {
        return res.status(200).send({
            status: 0,
            error: 'Unauthorized!'
        })
    }

    const user = mockUsers.get(userId)
    if (user) {
        user.acceptNotifications = acceptNotifications
        mockUsers.set(userId, user)
    }

    return res.status(200).send({
        status: 1
    })
})

// Message routes
app.post('/message/delete', (req, res) => {
    const { isAuthenticated, userId, messageIds } = req.body
    
    if (!isAuthenticated) {
        return res.status(200).send({
            status: 0,
            error: 'Unauthorized!'
        })
    }

    if (!Array.isArray(messageIds)) {
        return res.status(200).send({
            status: 0,
            error: 'messageIds must be an array'
        })
    }

    for (let messageId of messageIds) {
        const message = mockMessages.get(messageId)
        if (message && message.to === userId) {
            mockMessages.delete(messageId)
        }
    }

    return res.status(200).send({
        status: 1
    })
})

// Socket connection handling
const connectedUsers = new Map()

io.on('connection', (socket) => {
    console.log('User connected:', socket.id)
    
    let userId = null

    socket.on('initialComm', (id) => {
        userId = id
        connectedUsers.set(userId, socket.id)
        console.log('User registered:', userId)

        // Send any pending messages
        const userMessages = []
        for (let [messageId, message] of mockMessages) {
            if (message.to === userId) {
                userMessages.push({
                    _id: messageId,
                    ...message,
                    timestamp: message.timestamp || new Date()
                })
            }
        }

        if (userMessages.length > 0) {
            socket.emit('newMessages', JSON.stringify(userMessages))
        }
    })

    socket.on('sendMessage', (messageData) => {
        try {
            const { to, message, nonce } = JSON.parse(messageData)
            const messageId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
            
            const newMessage = {
                _id: messageId,
                from: userId,
                to,
                message,
                nonce,
                timestamp: new Date()
            }

            mockMessages.set(messageId, newMessage)

            // Send to recipient if online
            const recipientSocketId = connectedUsers.get(to)
            if (recipientSocketId) {
                const recipientSocket = io.sockets.sockets.get(recipientSocketId)
                if (recipientSocket) {
                    recipientSocket.emit('newMessage', JSON.stringify(newMessage))
                }
            }

            console.log('Message sent from', userId, 'to', to)
        } catch (error) {
            console.error('Error handling sendMessage:', error)
        }
    })

    socket.on('disconnect', () => {
        if (userId) {
            connectedUsers.delete(userId)
            console.log('User disconnected:', userId)
        }
    })
})

// Serve a simple web interface for testing
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>SecureChat Backend</title>
            <style>
                body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
                .status { padding: 10px; margin: 10px 0; border-radius: 5px; }
                .success { background-color: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
                .info { background-color: #d1ecf1; color: #0c5460; border: 1px solid #bee5eb; }
                pre { background-color: #f8f9fa; padding: 15px; border-radius: 5px; overflow-x: auto; }
                .endpoint { margin: 20px 0; padding: 15px; border: 1px solid #dee2e6; border-radius: 5px; }
            </style>
        </head>
        <body>
            <h1>🔐 SecureChat Backend Server</h1>
            <div class="status success">
                ✅ Server is running successfully on port ${process.env.SERVER_PORT || 3000}
            </div>
            
            <div class="status info">
                📱 This is the backend server for the SecureChat mobile application
            </div>

            <h2>📊 Server Statistics</h2>
            <ul>
                <li>Connected Users: ${connectedUsers.size}</li>
                <li>Total Users: ${mockUsers.size}</li>
                <li>Total Messages: ${mockMessages.size}</li>
                <li>Server Uptime: ${process.uptime().toFixed(0)} seconds</li>
            </ul>

            <h2>🔌 Available API Endpoints</h2>
            
            <div class="endpoint">
                <h3>POST /user</h3>
                <p>Create a new user account</p>
                <pre>curl -X POST http://localhost:3000/user \\
  -H "Content-Type: application/json" \\
  -d '{"installationId": "test123", "expoPushToken": "optional"}'</pre>
            </div>

            <div class="endpoint">
                <h3>GET /user/avatar</h3>
                <p>Get a random avatar URL</p>
                <pre>curl http://localhost:3000/user/avatar</pre>
            </div>

            <div class="endpoint">
                <h3>GET /user/avatar-thumbnails</h3>
                <p>Get all available avatar thumbnails</p>
                <pre>curl http://localhost:3000/user/avatar-thumbnails</pre>
            </div>

            <div class="endpoint">
                <h3>WebSocket Connection</h3>
                <p>Connect to Socket.IO for real-time messaging</p>
                <pre>const socket = io('http://localhost:3000');
socket.emit('initialComm', 'your-user-id');
socket.on('newMessage', (message) => console.log(message));</pre>
            </div>

            <h2>📝 Notes</h2>
            <ul>
                <li>This is a demo version using in-memory storage</li>
                <li>Data will be lost when the server restarts</li>
                <li>For production, connect to MongoDB and Redis as specified in the original docker-compose.yml</li>
                <li>The mobile app should be configured to connect to this server</li>
            </ul>

            <p><em>Last updated: ${new Date().toISOString()}</em></p>
        </body>
        </html>
    `)
})

const PORT = process.env.SERVER_PORT || 3000

http.listen(PORT, () => {
    console.log(`🔐 SecureChat Backend Server running on port ${PORT}`)
    console.log(`📱 Mobile apps can connect to: http://localhost:${PORT}`)
    console.log(`🌐 Web interface available at: http://localhost:${PORT}`)
    console.log(`📊 Server started at: ${new Date().toISOString()}`)
})