import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';

interface SocialConnection {
  id: number;
  name: string;
  encryptedFriends: string;
  publicConnections: number;
  timestamp: number;
  creator: string;
  publicValue1: number;
  publicValue2: number;
  isVerified?: boolean;
  decryptedValue?: number;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState<SocialConnection[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingConnection, setCreatingConnection] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ 
    visible: false, 
    status: "pending", 
    message: "" 
  });
  const [newConnectionData, setNewConnectionData] = useState({ name: "", friends: "", connections: "" });
  const [selectedConnection, setSelectedConnection] = useState<SocialConnection | null>(null);
  const [decryptedData, setDecryptedData] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [showStats, setShowStats] = useState(false);

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting } = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected || isInitialized || fhevmInitializing) return;
      
      try {
        setFhevmInitializing(true);
        await initialize();
      } catch (error) {
        setTransactionStatus({ 
          visible: true, 
          status: "error", 
          message: "FHEVM initialization failed" 
        });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      } finally {
        setFhevmInitializing(false);
      }
    };

    initFhevmAfterConnection();
  }, [isConnected, isInitialized, initialize, fhevmInitializing]);

  useEffect(() => {
    const loadDataAndContract = async () => {
      if (!isConnected) {
        setLoading(false);
        return;
      }
      
      try {
        await loadData();
        const contract = await getContractReadOnly();
        if (contract) setContractAddress(await contract.getAddress());
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDataAndContract();
  }, [isConnected]);

  const loadData = async () => {
    if (!isConnected) return;
    
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const businessIds = await contract.getAllBusinessIds();
      const connectionsList: SocialConnection[] = [];
      
      for (const businessId of businessIds) {
        try {
          const businessData = await contract.getBusinessData(businessId);
          connectionsList.push({
            id: parseInt(businessId.replace('connection-', '')) || Date.now(),
            name: businessData.name,
            encryptedFriends: businessId,
            publicConnections: Number(businessData.publicValue1) || 0,
            timestamp: Number(businessData.timestamp),
            creator: businessData.creator,
            publicValue1: Number(businessData.publicValue1) || 0,
            publicValue2: Number(businessData.publicValue2) || 0,
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0
          });
        } catch (e) {
          console.error('Error loading business data:', e);
        }
      }
      
      setConnections(connectionsList);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
    }
  };

  const createConnection = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setCreatingConnection(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Creating social connection with FHE..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const friendsValue = parseInt(newConnectionData.friends) || 0;
      const businessId = `connection-${Date.now()}`;
      
      const encryptedResult = await encrypt(contractAddress, address, friendsValue);
      
      const tx = await contract.createBusinessData(
        businessId,
        newConnectionData.name,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        parseInt(newConnectionData.connections) || 0,
        0,
        "Social Connection"
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Waiting for transaction confirmation..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "Connection created successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadData();
      setShowCreateModal(false);
      setNewConnectionData({ name: "", friends: "", connections: "" });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingConnection(false); 
    }
  };

  const decryptData = async (businessId: string): Promise<number | null> => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    setIsDecrypting(true);
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;
      
      const businessData = await contractRead.getBusinessData(businessId);
      if (businessData.isVerified) {
        const storedValue = Number(businessData.decryptedValue) || 0;
        
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "Data already verified on-chain" 
        });
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
        }, 2000);
        
        return storedValue;
      }
      
      const contractWrite = await getContractWithSigner();
      if (!contractWrite) return null;
      
      const encryptedValueHandle = await contractRead.getEncryptedValue(businessId);
      
      const result = await verifyDecryption(
        [encryptedValueHandle],
        contractAddress,
        (abiEncodedClearValues: string, decryptionProof: string) => 
          contractWrite.verifyDecryption(businessId, abiEncodedClearValues, decryptionProof)
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Verifying decryption on-chain..." });
      
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      
      await loadData();
      
      setTransactionStatus({ visible: true, status: "success", message: "Data decrypted and verified successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "Data is already verified on-chain" 
        });
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
        }, 2000);
        
        await loadData();
        return null;
      }
      
      setTransactionStatus({ 
        visible: true, 
        status: "error", 
        message: "Decryption failed: " + (e.message || "Unknown error") 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  const filteredConnections = connections.filter(conn => 
    conn.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const stats = {
    totalConnections: connections.length,
    verifiedConnections: connections.filter(c => c.isVerified).length,
    avgFriends: connections.length > 0 
      ? connections.reduce((sum, c) => sum + (c.decryptedValue || c.publicValue1), 0) / connections.length 
      : 0,
    recentConnections: connections.filter(c => 
      Date.now()/1000 - c.timestamp < 60 * 60 * 24 * 7
    ).length
  };

  const callIsAvailable = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const result = await contract.isAvailable();
      setTransactionStatus({ 
        visible: true, 
        status: "success", 
        message: "Contract is available and working!" 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Contract call failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>Private Social Graph 🔐</h1>
          </div>
          <div className="header-actions">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="connection-content">
            <div className="connection-icon">🔐</div>
            <h2>Connect Your Wallet</h2>
            <p>Connect your wallet to access the encrypted social graph system</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized || fhevmInitializing) {
    return (
      <div className="loading-screen">
        <div className="fhe-spinner"></div>
        <p>Initializing FHE System...</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>Loading encrypted social graph...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>Private Social Graph 🔐</h1>
        </div>
        
        <div className="header-actions">
          <button onClick={callIsAvailable} className="test-btn">
            Test Contract
          </button>
          <button onClick={() => setShowStats(!showStats)} className="stats-btn">
            {showStats ? "Hide Stats" : "Show Stats"}
          </button>
          <button onClick={() => setShowCreateModal(true)} className="create-btn">
            + New Connection
          </button>
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
        </div>
      </header>
      
      <div className="main-content">
        {showStats && (
          <div className="stats-panel">
            <div className="stat-item">
              <span>Total Connections</span>
              <strong>{stats.totalConnections}</strong>
            </div>
            <div className="stat-item">
              <span>Verified Data</span>
              <strong>{stats.verifiedConnections}</strong>
            </div>
            <div className="stat-item">
              <span>Avg Friends</span>
              <strong>{stats.avgFriends.toFixed(1)}</strong>
            </div>
            <div className="stat-item">
              <span>This Week</span>
              <strong>{stats.recentConnections}</strong>
            </div>
          </div>
        )}
        
        <div className="search-section">
          <input
            type="text"
            placeholder="Search connections..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
          <button onClick={loadData} className="refresh-btn" disabled={isRefreshing}>
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
        
        <div className="connections-grid">
          {filteredConnections.length === 0 ? (
            <div className="no-connections">
              <p>No social connections found</p>
              <button onClick={() => setShowCreateModal(true)} className="create-btn">
                Create First Connection
              </button>
            </div>
          ) : (
            filteredConnections.map((connection, index) => (
              <div 
                className={`connection-card ${selectedConnection?.id === connection.id ? "selected" : ""} ${connection.isVerified ? "verified" : ""}`}
                key={index}
                onClick={() => setSelectedConnection(connection)}
              >
                <div className="card-header">
                  <h3>{connection.name}</h3>
                  <span className={`status ${connection.isVerified ? "verified" : "encrypted"}`}>
                    {connection.isVerified ? "✅ Verified" : "🔒 Encrypted"}
                  </span>
                </div>
                <div className="card-content">
                  <div className="info-row">
                    <span>Public Connections:</span>
                    <strong>{connection.publicConnections}</strong>
                  </div>
                  <div className="info-row">
                    <span>Encrypted Friends:</span>
                    <strong>
                      {connection.isVerified ? 
                        `${connection.decryptedValue} friends` : 
                        "🔒 FHE Protected"
                      }
                    </strong>
                  </div>
                  <div className="info-row">
                    <span>Created:</span>
                    <span>{new Date(connection.timestamp * 1000).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="card-footer">
                  <span className="creator">
                    {connection.creator.substring(0, 6)}...{connection.creator.substring(38)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="create-modal">
            <div className="modal-header">
              <h2>New Social Connection</h2>
              <button onClick={() => setShowCreateModal(false)} className="close-btn">&times;</button>
            </div>
            
            <div className="modal-body">
              <div className="fhe-notice">
                <strong>FHE 🔐 Protection</strong>
                <p>Friend count will be encrypted with Zama FHE (Integer only)</p>
              </div>
              
              <div className="form-group">
                <label>Profile Name *</label>
                <input 
                  type="text" 
                  value={newConnectionData.name} 
                  onChange={(e) => setNewConnectionData({...newConnectionData, name: e.target.value})} 
                  placeholder="Enter profile name..." 
                />
              </div>
              
              <div className="form-group">
                <label>Number of Friends (FHE Encrypted) *</label>
                <input 
                  type="number" 
                  value={newConnectionData.friends} 
                  onChange={(e) => setNewConnectionData({...newConnectionData, friends: e.target.value})} 
                  placeholder="Enter friend count..." 
                  min="0"
                />
                <div className="data-label">FHE Encrypted Integer</div>
              </div>
              
              <div className="form-group">
                <label>Public Connections *</label>
                <input 
                  type="number" 
                  value={newConnectionData.connections} 
                  onChange={(e) => setNewConnectionData({...newConnectionData, connections: e.target.value})} 
                  placeholder="Enter public connections..." 
                  min="0"
                />
                <div className="data-label">Public Data</div>
              </div>
            </div>
            
            <div className="modal-footer">
              <button onClick={() => setShowCreateModal(false)} className="cancel-btn">Cancel</button>
              <button 
                onClick={createConnection} 
                disabled={creatingConnection || isEncrypting || !newConnectionData.name || !newConnectionData.friends || !newConnectionData.connections} 
                className="submit-btn"
              >
                {creatingConnection || isEncrypting ? "Encrypting..." : "Create Connection"}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {selectedConnection && (
        <div className="modal-overlay">
          <div className="detail-modal">
            <div className="modal-header">
              <h2>Connection Details</h2>
              <button onClick={() => {
                setSelectedConnection(null);
                setDecryptedData(null);
              }} className="close-btn">&times;</button>
            </div>
            
            <div className="modal-body">
              <div className="detail-section">
                <h3>Profile Information</h3>
                <div className="info-grid">
                  <div className="info-item">
                    <span>Name:</span>
                    <strong>{selectedConnection.name}</strong>
                  </div>
                  <div className="info-item">
                    <span>Creator:</span>
                    <span>{selectedConnection.creator}</span>
                  </div>
                  <div className="info-item">
                    <span>Created:</span>
                    <span>{new Date(selectedConnection.timestamp * 1000).toLocaleString()}</span>
                  </div>
                  <div className="info-item">
                    <span>Public Connections:</span>
                    <strong>{selectedConnection.publicConnections}</strong>
                  </div>
                </div>
              </div>
              
              <div className="detail-section">
                <h3>Encrypted Data</h3>
                <div className="encrypted-data">
                  <div className="data-row">
                    <span>Friend Count:</span>
                    <strong>
                      {selectedConnection.isVerified ? 
                        `${selectedConnection.decryptedValue} friends` : 
                        decryptedData !== null ? 
                        `${decryptedData} friends (Decrypted)` : 
                        "🔒 FHE Encrypted"
                      }
                    </strong>
                    <button 
                      onClick={async () => {
                        if (decryptedData !== null) {
                          setDecryptedData(null);
                        } else {
                          const result = await decryptData(selectedConnection.encryptedFriends);
                          if (result !== null) setDecryptedData(result);
                        }
                      }}
                      disabled={isDecrypting || fheIsDecrypting}
                      className={`decrypt-btn ${(selectedConnection.isVerified || decryptedData !== null) ? 'decrypted' : ''}`}
                    >
                      {isDecrypting || fheIsDecrypting ? "Decrypting..." : 
                       selectedConnection.isVerified ? "✅ Verified" : 
                       decryptedData !== null ? "🔄 Re-decrypt" : "🔓 Decrypt"}
                    </button>
                  </div>
                  
                  <div className="fhe-explanation">
                    <div className="fhe-icon">🔐</div>
                    <div>
                      <strong>FHE Protected Data</strong>
                      <p>Friend count is encrypted on-chain using Zama FHE. Click decrypt to verify the data.</p>
                    </div>
                  </div>
                </div>
              </div>
              
              {(selectedConnection.isVerified || decryptedData !== null) && (
                <div className="detail-section">
                  <h3>Social Analysis</h3>
                  <div className="analysis">
                    <div className="metric">
                      <span>Social Score</span>
                      <div className="score-bar">
                        <div 
                          className="score-fill" 
                          style={{ width: `${Math.min(100, (selectedConnection.isVerified ? selectedConnection.decryptedValue! : decryptedData!) * 2)}%` }}
                        ></div>
                      </div>
                    </div>
                    <div className="metrics-grid">
                      <div className="metric-item">
                        <span>Network Density</span>
                        <strong>{Math.round((selectedConnection.isVerified ? selectedConnection.decryptedValue! : decryptedData!) * 0.7)}%</strong>
                      </div>
                      <div className="metric-item">
                        <span>Influence Score</span>
                        <strong>{Math.round((selectedConnection.isVerified ? selectedConnection.decryptedValue! : decryptedData!) * 1.5)}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            <div className="modal-footer">
              <button onClick={() => {
                setSelectedConnection(null);
                setDecryptedData(null);
              }} className="close-btn">Close</button>
            </div>
          </div>
        </div>
      )}
      
      {transactionStatus.visible && (
        <div className="notification">
          <div className={`notification-content ${transactionStatus.status}`}>
            <div className="notification-icon">
              {transactionStatus.status === "pending" && <div className="spinner"></div>}
              {transactionStatus.status === "success" && "✓"}
              {transactionStatus.status === "error" && "✗"}
            </div>
            <span>{transactionStatus.message}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;