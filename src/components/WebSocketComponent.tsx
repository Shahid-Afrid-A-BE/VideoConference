import React, { useEffect, useRef } from 'react';

const WebSocketComponent: React.FC = () => {
    const localVideoRef = useRef<HTMLVideoElement>(null);               //HTMLVIdeoElement is the data types stored in localVideoRef
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null); //value of pc
    const webSocketRef = useRef<WebSocket | null>(null);            //dont use useState fro ws because useState is asynchronous hence setWS wil became slow but the program execution is faster than that,hence the execution stuck in some where because of setWs is not yet set    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const candidateQueueRef = useRef<RTCIceCandidateInit[]>([]);    //avoid using useState for real time application
    const hasSentIceCandidateRef = useRef<boolean>(false);          // Flag to track if an ICE candidate has been sent(to avoid repetitive ICE candidate gathering from local device)

    useEffect(() => {
        // Step 1: Establish WebSocket Connection
        const ws = new WebSocket('ws://localhost:8090/ws');
        webSocketRef.current = ws;

        ws.onopen = () => console.log("Step 1: WebSocket connection established.");

        //@event : auto triggers when any message received from signaling server
        ws.onmessage = async (messageEvent) => {
            console.log("Step 2: Signaling message received:", JSON.parse(messageEvent.data));
            await handleSignalingMessage(JSON.parse(messageEvent.data));        //handle the received signaling message
        };
        ws.onclose = () => console.log("WebSocket connection closed.");

        return () => ws.close();
    }, []);

    //@fn : To send message from client to signaling server
    const sendMessage = (message: object) => {
        if (webSocketRef.current?.readyState === WebSocket.OPEN) {
            webSocketRef.current.send(JSON.stringify(message));         //message should be send and received in JSON format
            console.log("Step 5: Signaling message sent:", message);
        } else {
            console.error("WebSocket not open. Message not sent:", message);
        }
    };

    //@fn : Establish peer connection
    const initializePeerConnection = (): RTCPeerConnection => {
        if (peerConnectionRef.current) {
            return peerConnectionRef.current;
        }

        //peer connection establishment
        const pc = new RTCPeerConnection({
            iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });
        console.log("step 2 : peer connection initialized");

        //assign peer connection value to ref hook
        peerConnectionRef.current = pc;

        //@event : auto triggered Each time when a new ICE candidate is discovered by the browser during the connection process.
        pc.onicecandidate = (event) => {
            if (event.candidate && !hasSentIceCandidateRef.current) {
                console.log("Step 6: ICE candidate gathered and sent:", event.candidate);
                sendMessage({ type: "candidate", candidate: event.candidate });
                hasSentIceCandidateRef.current = true; // Set the flag after sending the first ICE candidate
            } else if (!event.candidate) {
                console.log("All ICE candidates have been gathered.");
            }
        };

        //@event : auto triggered when remote track is received
        pc.ontrack = (event) => {
            console.log("Step 7: Remote video track received.");
            if (event.streams[0]) {
                console.log("Step 7.1: Setting remote video track.");
                if (remoteVideoRef.current) {
                    remoteVideoRef.current.srcObject = event.streams[0];
                }
            }
        };

        //@event : auto trigeerd when ICE connection state change(state : checking,connected)
        pc.oniceconnectionstatechange = () => {
            console.log("ICE Connection State changed:", pc.iceConnectionState);
        };

       //return peer connection primise to called function
        return pc;
    };

    //@fn : Process the ICE candidate gathered from local device. The ICE candidates are pushed in Queue to wait until rempte description is set for answer or offer
    const processCandidateQueue = async (pc: RTCPeerConnection) => {
        console.log("Step 6.1: Processing queued ICE candidates...");

        //Multiple ICE candidates may be gathered by browser
        if (candidateQueueRef.current.length > 0) {
            // Only process the last candidate in the queue(doesnt need to process all ICE candidate gatherd by browser)
            const lastCandidate = candidateQueueRef.current.pop();
            if (lastCandidate) {
                console.log("Adding the last ICE candidate:", lastCandidate);
                await pc.addIceCandidate(new RTCIceCandidate(lastCandidate));       //add ICE candidate to peer connection
            }
        }
    };

    //@fn : handle signaling message received from signaling server(web socket)
    const handleSignalingMessage = async (data: any) => {
        const pc = initializePeerConnection();

        //data = message (based on type of data the message should be handled appropialtely)
        switch (data.type) {
            case "offer":       //call receiver client gets this signaling message from call intiator client through webscoket
                console.log("Step 3: Offer received from signaling server.");
                try {
                    await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
                    console.log("Step 3.1: Remote description set for offer.");

                    // Access local media (audio and video)
                    const localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                    localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

                    if (localVideoRef.current) {
                        localVideoRef.current.srcObject = localStream;
                        console.log("Step 3.2: Local media stream set to local video element.");
                    }

                    // Create and send answer from call recievr to call itniator
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    console.log("Step 3.3: Answer created and sent.");
                    sendMessage({ type: "answer", answer });

                    await processCandidateQueue(pc);        //stop program execution until ICE candidates in candidate queue are processed(ICE candidate should be processed after remote description is set)
                } catch (error) {
                    console.error("Error handling offer:", error);
                }
                break;

            case "answer":      //signaling message received by call initiator
                console.log("Step 4: Answer received from signaling server.");
                try {
                    if (pc.signalingState === "have-local-offer") {
                        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
                        console.log("Step 4.1: Remote description set for answer.");
                        await processCandidateQueue(pc);
                    } else {
                        console.error("Invalid state for setting remote answer.");
                    }
                } catch (error) {
                    console.error("Error handling answer:", error);
                }
                break;

            case "candidate":   //when a client(call receiver or intiator) receives candidate mesaage it is handled in this block of code
                console.log("Step 6.2: ICE candidate received.");
                if (pc.remoteDescription) {  //ICE candidate are processed after remote description is set
                    try {
                        console.log("Adding ICE candidate to peer connection.");
                        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));  //add ICE candidate 
                    } catch (error) {
                        console.error("Error adding ICE candidate:", error);
                    }
                } else {
                    console.log("Remote description not set yet. Queueing candidate.");
                    candidateQueueRef.current.push(data.candidate);
                }
                break;

            default:
                console.log("Unknown signaling message type:", data.type);
        }
    };

    //@fn : rriggered when start call button is pressed
    const startCall = async () => {
        const pc = initializePeerConnection();

        try {
            console.log("Step 2: Starting call. Accessing local media...");

            const localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });    //local device video and audio(media) is accessed
            localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));                    //local media is added to peerconnection

            if (localVideoRef.current) {
                localVideoRef.current.srcObject = localStream;      //set local media to ref hook to set the local media to <video> DOM
                console.log("Step 2.1: Local media stream set to local video element.");
            }

            const offer = await pc.createOffer();       //offer signal for call is created
            await pc.setLocalDescription(offer);        //local decription for offer is set on peer connection
            console.log("Step 2.2: Offer created and sent.");
            sendMessage({ type: "offer", offer });      //offer signal is send to clients connected with websocket through websocket
        } catch (error) {
            console.error("Error during call initialization:", error);
        }
    };

    return (
        <div>
            <video ref={localVideoRef} autoPlay muted style={{ width: "300px", border: "2px solid black", borderRadius: "10px" }} />    {/* DOM for local vide0 */}
            <video ref={remoteVideoRef} autoPlay style={{ width: "300px", border: "2px solid black", borderRadius: "10px" }} />         {/* DOM for remote video */}
            <button onClick={startCall}>Start Call</button>
        </div>
    );
};

export default WebSocketComponent;
