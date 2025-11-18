import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';

interface SocialConnection {
  id: string;
  name: string;
  encryptedValue: number;
  publicValue1: number;
  publicValue2: number;
  description: string;
  timestamp: number;
  creator: string;
  isVerified?: boolean;
  decryptedValue?: number;
}

interface SocialGraph {
  nodes: Array<{id: string, name: string, value: number}>;
  links: Array<{source: string, target: string, strength: number}>;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState<SocialConnection[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addingConnection, setAddingConnection] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ 
    visible: false, 
    status: "pending" as const, 
    message: "" 
  });
  const [newConnectionData, setNewConnectionData] = useState({ name: "", closeness: "", description: "" });
  const [selectedConnection, setSelectedConnection] = useState<SocialConnection | null>(null);
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [activeTab, setActiveTab] = useState("graph");
  const [searchTerm, setSearchTerm] = useState("");
  const [operationHistory, setOperationHistory] = useState<Array<{type: string, timestamp: number, data: string}>>([]);

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting} = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected) return;
      if (isInitialized || fhevmInitializing) return;
      
      try {
        setFhevmInitializing(true);
        await initialize();
        addToHistory("FHEVM Initialized", "System ready for encrypted operations");
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
        await loadConnections();
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

  const addToHistory = (type: string, data: string) => {
    setOperationHistory(prev => [{
      type,
      timestamp: Date.now(),
      data
    }, ...prev.slice(0, 9)]);
  };

  const loadConnections = async () => {
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
            id: businessId,
            name: businessData.name,
            encryptedValue: 0,
            publicValue1: Number(businessData.publicValue1) || 0,
            publicValue2: Number(businessData.publicValue2) || 0,
            description: businessData.description,
            timestamp: Number(businessData.timestamp),
            creator: businessData.creator,
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0
          });
        } catch (e) {
          console.error('Error loading connection data:', e);
        }
      }
      
      setConnections(connectionsList);
      addToHistory("Data Loaded", `Loaded ${connectionsList.length} connections`);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
    }
  };

  const addConnection = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setAddingConnection(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Adding connection with FHE encryption..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const closenessValue = parseInt(newConnectionData.closeness) || 0;
      const businessId = `connection-${Date.now()}`;
      
      const encryptedResult = await encrypt(contractAddress, address, closenessValue);
      
      const tx = await contract.createBusinessData(
        businessId,
        newConnectionData.name,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        closenessValue,
        0,
        newConnectionData.description
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Waiting for transaction confirmation..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "Connection added successfully!" });
      addToHistory("Connection Added", `Added: ${newConnectionData.name}`);
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadConnections();
      setShowAddModal(false);
      setNewConnectionData({ name: "", closeness: "", description: "" });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setAddingConnection(false); 
    }
  };

  const decryptConnection = async (connection: SocialConnection): Promise<number | null> => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;
      
      const businessData = await contractRead.getBusinessData(connection.id);
      if (businessData.isVerified) {
        const storedValue = Number(businessData.decryptedValue) || 0;
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "Data already verified on-chain" 
        });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
        return storedValue;
      }
      
      const contractWrite = await getContractWithSigner();
      if (!contractWrite) return null;
      
      const encryptedValueHandle = await contractRead.getEncryptedValue(connection.id);
      
      const result = await verifyDecryption(
        [encryptedValueHandle],
        contractAddress,
        (abiEncodedClearValues: string, decryptionProof: string) => 
          contractWrite.verifyDecryption(connection.id, abiEncodedClearValues, decryptionProof)
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Verifying decryption on-chain..." });
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      
      await loadConnections();
      setTransactionStatus({ visible: true, status: "success", message: "Connection closeness decrypted!" });
      addToHistory("Data Decrypted", `Decrypted: ${connection.name}`);
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "Data is already verified on-chain" 
        });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
        await loadConnections();
        return null;
      }
      
      setTransactionStatus({ 
        visible: true, 
        status: "error", 
        message: "Decryption failed: " + (e.message || "Unknown error") 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
  };

  const checkAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const available = await contract.isAvailable();
      setTransactionStatus({ 
        visible: true, 
        status: "success", 
        message: `Contract is ${available ? "available" : "unavailable"}` 
      });
      addToHistory("Availability Check", "Contract status verified");
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Availability check failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const generateGraphData = (): SocialGraph => {
    const nodes = connections.map(conn => ({
      id: conn.id,
      name: conn.name,
      value: conn.publicValue1
    }));
    
    const links = connections.slice(0, Math.min(connections.length, 5)).map((conn, index) => ({
      source: "you",
      target: conn.id,
      strength: conn.publicValue1 / 10
    }));
    
    return { nodes: [{id: "you", name: "You", value: 10}, ...nodes], links };
  };

  const filteredConnections = connections.filter(conn => 
    conn.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    conn.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const stats = {
    total: connections.length,
    verified: connections.filter(c => c.isVerified).length,
    avgCloseness: connections.length > 0 ? 
      connections.reduce((sum, c) => sum + c.publicValue1, 0) / connections.length : 0,
    recent: connections.filter(c => Date.now()/1000 - c.timestamp < 604800).length
  };

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>Private Social Graph 🔐</h1>
          </div>
          <div className="header-actions">
            <div className="wallet-connect-wrapper">
              <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
            </div>
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="connection-content">
            <div className="connection-icon">🔒</div>
            <h2>Connect to Encrypted Social Network</h2>
            <p>Your social connections are protected with FHE technology</p>
            <div className="connection-steps">
              <div className="step">
                <span>1</span>
                <p>Connect wallet to initialize FHE system</p>
              </div>
              <div className="step">
                <span>2</span>
                <p>Add encrypted social connections</p>
              </div>
              <div className="step">
                <span>3</span>
                <p>Discover mutual friends privately</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized || fhevmInitializing) {
    return (
      <div className="loading-screen">
        <div className="fhe-spinner"></div>
        <p>Initializing FHE Encryption...</p>
        <p className="loading-note">Securing your social data</p>
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
          <h1>Social Graph FHE 🔐</h1>
          <p>Privacy-Preserving Connections</p>
        </div>
        
        <div className="header-actions">
          <button onClick={checkAvailability} className="availability-btn">
            Check Availability
          </button>
          <button onClick={() => setShowAddModal(true)} className="add-btn">
            + Add Connection
          </button>
          <div className="wallet-connect-wrapper">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </div>
      </header>
      
      <div className="main-content">
        <div className="stats-panel">
          <div className="stat-card">
            <div className="stat-value">{stats.total}</div>
            <div className="stat-label">Total Connections</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.verified}</div>
            <div className="stat-label">Verified</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.avgCloseness.toFixed(1)}</div>
            <div className="stat-label">Avg Closeness</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.recent}</div>
            <div className="stat-label">This Week</div>
          </div>
        </div>
        
        <div className="content-tabs">
          <button 
            className={`tab ${activeTab === "graph" ? "active" : ""}`}
            onClick={() => setActiveTab("graph")}
          >
            Social Graph
          </button>
          <button 
            className={`tab ${activeTab === "list" ? "active" : ""}`}
            onClick={() => setActiveTab("list")}
          >
            Connections List
          </button>
          <button 
            className={`tab ${activeTab === "history" ? "active" : ""}`}
            onClick={() => setActiveTab("history")}
          >
            Operation History
          </button>
        </div>
        
        <div className="tab-content">
          {activeTab === "graph" && (
            <div className="graph-view">
              <h3>Your Social Network</h3>
              <div className="graph-visualization">
                {generateGraphData().nodes.map(node => (
                  <div key={node.id} className="graph-node">
                    <div className="node-avatar">{node.name.charAt(0)}</div>
                    <div className="node-name">{node.name}</div>
                    <div className="node-value">{node.value}/10</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {activeTab === "list" && (
            <div className="list-view">
              <div className="list-header">
                <div className="search-box">
                  <input 
                    type="text"
                    placeholder="Search connections..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <button onClick={loadConnections} className="refresh-btn">
                  {isRefreshing ? "Refreshing..." : "Refresh"}
                </button>
              </div>
              
              <div className="connections-list">
                {filteredConnections.map(connection => (
                  <div 
                    key={connection.id} 
                    className={`connection-item ${connection.isVerified ? "verified" : ""}`}
                    onClick={() => setSelectedConnection(connection)}
                  >
                    <div className="connection-avatar">{connection.name.charAt(0)}</div>
                    <div className="connection-info">
                      <div className="connection-name">{connection.name}</div>
                      <div className="connection-desc">{connection.description}</div>
                      <div className="connection-meta">
                        <span>Closeness: {connection.publicValue1}/10</span>
                        <span>{new Date(connection.timestamp * 1000).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="connection-status">
                      {connection.isVerified ? "✅ Verified" : "🔒 Encrypted"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {activeTab === "history" && (
            <div className="history-view">
              <h3>Recent Operations</h3>
              <div className="history-list">
                {operationHistory.map((op, index) => (
                  <div key={index} className="history-item">
                    <div className="history-type">{op.type}</div>
                    <div className="history-data">{op.data}</div>
                    <div className="history-time">
                      {new Date(op.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        
        <div className="partners-section">
          <h3>Technology Partners</h3>
          <div className="partners-grid">
            <div className="partner-logo">Zama FHE</div>
            <div className="partner-logo">Web3 Social</div>
            <div className="partner-logo">Privacy Tech</div>
          </div>
        </div>
      </div>
      
      {showAddModal && (
        <div className="modal-overlay">
          <div className="add-connection-modal">
            <div className="modal-header">
              <h2>Add Social Connection</h2>
              <button onClick={() => setShowAddModal(false)} className="close-modal">&times;</button>
            </div>
            
            <div className="modal-body">
              <div className="fhe-notice">
                <strong>FHE Encryption Active</strong>
                <p>Closeness score will be encrypted with Zama FHE</p>
              </div>
              
              <div className="form-group">
                <label>Connection Name *</label>
                <input 
                  type="text" 
                  value={newConnectionData.name} 
                  onChange={(e) => setNewConnectionData({...newConnectionData, name: e.target.value})} 
                  placeholder="Enter name..." 
                />
              </div>
              
              <div className="form-group">
                <label>Closeness Score (1-10) *</label>
                <input 
                  type="number" 
                  min="1" 
                  max="10" 
                  value={newConnectionData.closeness} 
                  onChange={(e) => setNewConnectionData({...newConnectionData, closeness: e.target.value})} 
                  placeholder="1-10" 
                />
                <div className="data-type-label">FHE Encrypted Integer</div>
              </div>
              
              <div className="form-group">
                <label>Description</label>
                <input 
                  type="text" 
                  value={newConnectionData.description} 
                  onChange={(e) => setNewConnectionData({...newConnectionData, description: e.target.value})} 
                  placeholder="Relationship description..." 
                />
              </div>
            </div>
            
            <div className="modal-footer">
              <button onClick={() => setShowAddModal(false)} className="cancel-btn">Cancel</button>
              <button 
                onClick={addConnection} 
                disabled={addingConnection || isEncrypting || !newConnectionData.name || !newConnectionData.closeness} 
                className="submit-btn"
              >
                {addingConnection || isEncrypting ? "Encrypting..." : "Add Connection"}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {selectedConnection && (
        <div className="modal-overlay">
          <div className="connection-detail-modal">
            <div className="modal-header">
              <h2>Connection Details</h2>
              <button onClick={() => setSelectedConnection(null)} className="close-modal">&times;</button>
            </div>
            
            <div className="modal-body">
              <div className="connection-header">
                <div className="detail-avatar">{selectedConnection.name.charAt(0)}</div>
                <div className="detail-info">
                  <h3>{selectedConnection.name}</h3>
                  <p>{selectedConnection.description}</p>
                </div>
              </div>
              
              <div className="connection-stats">
                <div className="stat">
                  <label>Public Closeness</label>
                  <div className="value">{selectedConnection.publicValue1}/10</div>
                </div>
                <div className="stat">
                  <label>Encrypted Value</label>
                  <div className="value">
                    {selectedConnection.isVerified ? 
                      `${selectedConnection.decryptedValue} (Verified)` : 
                      "🔒 Encrypted"
                    }
                  </div>
                </div>
                <div className="stat">
                  <label>Added</label>
                  <div className="value">{new Date(selectedConnection.timestamp * 1000).toLocaleDateString()}</div>
                </div>
              </div>
              
              <button 
                onClick={() => decryptConnection(selectedConnection)}
                disabled={fheIsDecrypting || selectedConnection.isVerified}
                className="decrypt-btn"
              >
                {fheIsDecrypting ? "Decrypting..." : 
                 selectedConnection.isVerified ? "✅ Already Verified" : 
                 "🔓 Verify Closeness"}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="fhe-spinner"></div>}
              {transactionStatus.status === "success" && "✓"}
              {transactionStatus.status === "error" && "✗"}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;


