import React, { useState, useEffect, useRef } from 'react';

const WebSocketComponent: React.FC = () => {
    const [messages, setMessages] = useState<string[]>([]);
    const [input, setInput] = useState('');
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const webSocketRef = useRef<WebSocket | null>(null);

    useEffect(() => {
        console.log("Step 1: Initializing WebSocket connection");

        // Initialize WebSocket connection
        const ws = new WebSocket('ws://localhost:8090/ws');
        webSocketRef.current = ws;

        ws.onopen = () => {
            console.log("Step 2: Connected to WebSocket server");
        };

        ws.onmessage = (messageEvent) => {
            console.log("Step 3: Received raw message:", messageEvent.data);
            const data = JSON.parse(messageEvent.data); // Only JSON data can be received
            console.log("Step 4: Parsed JSON data:", data);
            handleSignallingMessage(data);
        };

        ws.onclose = () => {
            console.log("Step 5: WebSocket connection ended");
        };

        return () => {
            console.log("Step 6: Cleaning up WebSocket connection");
            ws.close();
        };
    }, []);

    const sendMessage = (message: object) => {
        console.log("Step 7: Preparing to send message");
        if (webSocketRef.current && webSocketRef.current.readyState === WebSocket.OPEN) {
            webSocketRef.current.send(JSON.stringify(message));
            console.log("Step 8: Message sent", message);
        } else {
            console.error("WebSocket is not open. Message not sent");
        }
    };

    const handleSignallingMessage = async (data: any) => {
        console.log("Step 9: Handling signaling message with type:", data.type);

        if (data.type === "offer") {
            console.log("Step 10: Received 'offer', initializing peer connection");
            const pc = await initializePeerConnection();

            if (!data.offer || !data.offer.sdp || data.offer.type !== "offer") {
                console.error("Invalid offer received:", data.offer);
                return;
            }

            await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            console.log("Step 12: Sending 'answer' signaling message");
            sendMessage({ type: "answer", answer });
        } else if (data.type === "answer") {
            console.log("Step 13: Received 'answer'");
            const pc = await initializePeerConnection();
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        } else if (data.type === "candidate") {
            console.log("Step 14: Received 'candidate'");
            const pc = await initializePeerConnection();
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } else {
            console.log("Step 15: Unknown signaling message type");
        }
    };

    const initializePeerConnection = async (): Promise<RTCPeerConnection> => {
        console.log("Step 16: Initializing peer connection");

        try {
            const pc = new RTCPeerConnection({
                iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
            });

            pc.oniceconnectionstatechange = () => {
                console.log("Step 17: ICE Connection State:", pc.iceConnectionState);
            };

            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    console.log("Step 18: Sending ICE candidate");
                    sendMessage({ type: "candidate", candidate: event.candidate });
                }
            };

            pc.ontrack = (event) => {
                if (remoteVideoRef.current) {
                    console.log("Step 19: Received remote track");
                    remoteVideoRef.current.srcObject = event.streams[0];
                }
            };

            console.log("Step 20: Peer connection initialized");
            return pc;
        } catch (error) {
            console.error("Error initializing peer connection:", error);
            throw error;
        }
    };

    const startCall = async () => {
        console.log("Step 21: Starting call");

        try {
            console.log("Step 22: Initializing peer connection for the call");
            const pc = await initializePeerConnection();

            console.log("Step 23: Accessing local media");
            const localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

            localStream.getTracks().forEach((track) => {
                pc.addTrack(track, localStream);
                console.log("Step 24: Track added to peer connection:", track);
            });

            if (localVideoRef.current) {
                localVideoRef.current.srcObject = localStream;
                console.log("Step 25: Local media stream displayed");
            }

            console.log("Step 26: Creating offer");
            const offer = await pc.createOffer();

            if (offer && offer.sdp) {
                console.log("Step 27: Setting local description and sending offer");
                await pc.setLocalDescription(offer);
                sendMessage({ type: "offer", offer });
            }
        } catch (error) {
            console.error("Error starting call:", error);
        }
    };

    return (
        <div>
            <video ref={localVideoRef} autoPlay muted style={{ width: "300px" }} />
            <video ref={remoteVideoRef} autoPlay style={{ width: "300px" }} />
            <button onClick={startCall}>Start Call</button>
        </div>
    );
};

export default WebSocketComponent;
