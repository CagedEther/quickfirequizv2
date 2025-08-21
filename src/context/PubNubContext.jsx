import React, { createContext, useContext, useEffect, useState } from 'react';
import PubNub from 'pubnub';
import { PUBNUB_CONFIG, CHANNELS, MESSAGE_TYPES, isUsingDemoKeys } from '../config/pubnub';

const PubNubContext = createContext();

export const usePubNub = () => {
  const context = useContext(PubNubContext);
  if (!context) {
    console.error('usePubNub called outside of PubNubProvider');
    throw new Error('usePubNub must be used within a PubNubProvider');
  }
  return context;
};

export const PubNubProvider = ({ children }) => {
  const [pubnub, setPubnub] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [messages, setMessages] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('Initializing...');

  useEffect(() => {
    // Initialize PubNub
    const pn = new PubNub({
      publishKey: PUBNUB_CONFIG.publishKey,
      subscribeKey: PUBNUB_CONFIG.subscribeKey,
      uuid: PUBNUB_CONFIG.uuid,
      autoNetworkDetection: true,
      restore: true
    });

    // Add listeners
    pn.addListener({
      status: (statusEvent) => {
        console.log('PubNub Status:', statusEvent);
        if (statusEvent.category === 'PNConnectedCategory') {
          setIsConnected(true);
          const keyStatus = isUsingDemoKeys() ? ' (Demo Keys)' : ' (Your Keys)';
          setConnectionStatus('Connected' + keyStatus);
        } else if (statusEvent.category === 'PNNetworkDownCategory') {
          setIsConnected(false);
          setConnectionStatus('Connection Lost');
        } else if (statusEvent.category === 'PNReconnectedCategory') {
          setIsConnected(true);
          setConnectionStatus('Reconnected');
        } else if (statusEvent.category === 'PNAccessDeniedCategory') {
          setIsConnected(false);
          setConnectionStatus('Access Denied - Check Keys');
        }
      },
      message: (messageEvent) => {
        console.log('PubNub Message:', messageEvent);
        setMessages(prev => [...prev, messageEvent]);
      },
      presence: (presenceEvent) => {
        console.log('PubNub Presence:', presenceEvent);
      }
    });

    setPubnub(pn);
    setIsInitialized(true);

    // Cleanup function
    return () => {
      if (pn) {
        pn.unsubscribeAll();
        pn.removeAllListeners();
      }
      setIsInitialized(false);
      setIsConnected(false);
      setConnectionStatus('Disconnected');
    };
  }, []);

  const publishMessage = async (channel, message) => {
    if (!pubnub) {
      console.error('PubNub not initialized');
      return;
    }

    try {
      const result = await pubnub.publish({
        channel,
        message: {
          ...message,
          timestamp: Date.now(),
          uuid: PUBNUB_CONFIG.uuid
        }
      });
      console.log('Message published:', result);
      return result;
    } catch (error) {
      console.error('Error publishing message:', error);
      throw error;
    }
  };

  const subscribeToChannels = (channels) => {
    if (!pubnub) {
      console.error('PubNub not initialized');
      return;
    }

    try {
      pubnub.subscribe({
        channels,
        withPresence: true
      });
    } catch (error) {
      console.error('Error subscribing to channels:', error);
    }
  };

  const unsubscribeFromChannels = (channels) => {
    if (!pubnub) {
      console.error('PubNub not initialized');
      return;
    }

    pubnub.unsubscribe({
      channels
    });
  };

  const getPresence = async (channel) => {
    if (!pubnub) {
      console.error('PubNub not initialized');
      return null;
    }

    try {
      const response = await pubnub.hereNow({
        channels: [channel],
        includeUUIDs: true
      });
      return response;
    } catch (error) {
      console.error('Error getting presence:', error);
      return null;
    }
  };

  const value = {
    pubnub,
    isConnected,
    isInitialized,
    connectionStatus,
    messages,
    publishMessage,
    subscribeToChannels,
    unsubscribeFromChannels,
    getPresence,
    channels: CHANNELS,
    messageTypes: MESSAGE_TYPES,
    userUuid: PUBNUB_CONFIG.uuid,
    isUsingDemoKeys: isUsingDemoKeys()
  };

  return (
    <PubNubContext.Provider value={value}>
      {children}
    </PubNubContext.Provider>
  );
};

