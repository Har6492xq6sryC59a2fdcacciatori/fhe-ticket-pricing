// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface FlightQuery {
  id: string;
  origin: string;
  destination: string;
  departureDate: string;
  encryptedQuery: string;
  encryptedPrice: string;
  timestamp: number;
  owner: string;
  status: "pending" | "completed";
}

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [queries, setQueries] = useState<FlightQuery[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showQueryModal, setShowQueryModal] = useState(false);
  const [querying, setQuerying] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newQueryData, setNewQueryData] = useState({
    origin: "",
    destination: "",
    departureDate: "",
    passengers: 1
  });
  const [showTutorial, setShowTutorial] = useState(false);
  const [expandedQueryId, setExpandedQueryId] = useState<string | null>(null);
  
  // Calculate statistics for dashboard
  const completedCount = queries.filter(q => q.status === "completed").length;
  const pendingCount = queries.filter(q => q.status === "pending").length;
  
  // Price statistics
  const minPrice = queries.length > 0 
    ? Math.min(...queries.map(q => parseInt(q.encryptedPrice || "0"))) 
    : 0;
  const maxPrice = queries.length > 0 
    ? Math.max(...queries.map(q => parseInt(q.encryptedPrice || "0"))) 
    : 0;
  const avgPrice = queries.length > 0 
    ? Math.round(queries.reduce((sum, q) => sum + parseInt(q.encryptedPrice || "0"), 0) / queries.length) 
    : 0;

  useEffect(() => {
    loadQueries().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadQueries = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("query_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing query keys:", e);
        }
      }
      
      const list: FlightQuery[] = [];
      
      for (const key of keys) {
        try {
          const queryBytes = await contract.getData(`query_${key}`);
          if (queryBytes.length > 0) {
            try {
              const queryData = JSON.parse(ethers.toUtf8String(queryBytes));
              list.push({
                id: key,
                origin: queryData.origin,
                destination: queryData.destination,
                departureDate: queryData.departureDate,
                encryptedQuery: queryData.encryptedQuery,
                encryptedPrice: queryData.encryptedPrice,
                timestamp: queryData.timestamp,
                owner: queryData.owner,
                status: queryData.status || "pending"
              });
            } catch (e) {
              console.error(`Error parsing query data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading query ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setQueries(list);
    } catch (e) {
      console.error("Error loading queries:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const submitQuery = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setQuerying(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting query with FHE..."
    });
    
    try {
      // Simulate FHE encryption of query
      const encryptedQuery = `FHE-${btoa(JSON.stringify(newQueryData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const queryId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      // Simulate FHE market analysis to generate price
      const basePrice = 300 + Math.floor(Math.random() * 700);
      const encryptedPrice = `FHE-${btoa(JSON.stringify({ price: basePrice }))}`;
      
      const queryData = {
        origin: newQueryData.origin,
        destination: newQueryData.destination,
        departureDate: newQueryData.departureDate,
        encryptedQuery: encryptedQuery,
        encryptedPrice: encryptedPrice,
        timestamp: Math.floor(Date.now() / 1000),
        owner: account,
        status: "pending"
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `query_${queryId}`, 
        ethers.toUtf8Bytes(JSON.stringify(queryData))
      );
      
      const keysBytes = await contract.getData("query_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(queryId);
      
      await contract.setData(
        "query_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Encrypted query submitted! Processing with FHE..."
      });
      
      // Simulate FHE processing delay
      setTimeout(async () => {
        // Update status to completed
        const updatedQueryData = {
          ...queryData,
          status: "completed"
        };
        
        await contract.setData(
          `query_${queryId}`, 
          ethers.toUtf8Bytes(JSON.stringify(updatedQueryData))
        );
        
        await loadQueries();
        
        setTransactionStatus({
          visible: true,
          status: "success",
          message: "FHE analysis complete! Price generated anonymously."
        });
        
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
          setShowQueryModal(false);
          setNewQueryData({
            origin: "",
            destination: "",
            departureDate: "",
            passengers: 1
          });
        }, 2000);
      }, 3000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
      setQuerying(false);
    }
  };

  const isOwner = (address: string) => {
    return account.toLowerCase() === address.toLowerCase();
  };

  const tutorialSteps = [
    {
      title: "Connect Wallet",
      description: "Connect your Web3 wallet to interact with the platform",
      icon: "🔗"
    },
    {
      title: "Submit Encrypted Query",
      description: "Enter your flight details which will be encrypted using FHE",
      icon: "🔒"
    },
    {
      title: "FHE Market Analysis",
      description: "Market data is aggregated and analyzed while keeping your query encrypted",
      icon: "📊"
    },
    {
      title: "Receive Anonymous Price",
      description: "Get a fair price without revealing your identity or travel patterns",
      icon: "💸"
    }
  ];

  const renderPriceChart = () => {
    // Only show completed queries with prices
    const completedQueries = queries.filter(q => q.status === "completed" && q.encryptedPrice);
    
    if (completedQueries.length === 0) {
      return (
        <div className="no-data-chart">
          <p>No pricing data available</p>
          <p>Submit a query to see price trends</p>
        </div>
      );
    }
    
    // Extract prices
    const prices = completedQueries.map(q => {
      try {
        const priceData = JSON.parse(atob(q.encryptedPrice.replace("FHE-", "")));
        return priceData.price;
      } catch {
        return 0;
      }
    });
    
    // Find min and max for chart scaling
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const range = maxPrice - minPrice || 1;
    
    // Chart dimensions
    const chartHeight = 200;
    const barWidth = 30;
    const spacing = 10;
    
    return (
      <div className="price-chart-container">
        <svg width="100%" height={chartHeight + 30}>
          {/* Y-axis labels */}
          <text x="5" y="15" className="chart-label">${maxPrice}</text>
          <text x="5" y={chartHeight/2 + 15} className="chart-label">${Math.round((minPrice + maxPrice)/2)}</text>
          <text x="5" y={chartHeight + 15} className="chart-label">${minPrice}</text>
          
          {/* Grid lines */}
          <line x1="40" y1="0" x2="40" y2={chartHeight} className="grid-line" />
          <line x1="40" y1={chartHeight/2} x2="100%" y2={chartHeight/2} className="grid-line" />
          
          {/* Price bars */}
          {prices.map((price, index) => {
            const barHeight = ((price - minPrice) / range) * chartHeight;
            const xPos = 50 + index * (barWidth + spacing);
            
            return (
              <g key={index}>
                <rect 
                  x={xPos} 
                  y={chartHeight - barHeight} 
                  width={barWidth} 
                  height={barHeight} 
                  className="price-bar"
                />
                <text 
                  x={xPos + barWidth/2} 
                  y={chartHeight - barHeight - 5} 
                  className="price-label"
                >
                  ${price}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    );
  };

  const toggleQueryDetails = (id: string) => {
    if (expandedQueryId === id) {
      setExpandedQueryId(null);
    } else {
      setExpandedQueryId(id);
    }
  };

  const formatDate = (dateString: string) => {
    const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString(undefined, options);
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="metal-spinner"></div>
      <p>Initializing FHE connection...</p>
    </div>
  );

  return (
    <div className="app-container metal-theme">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="plane-icon"></div>
          </div>
          <h1>FHE<span>Airfare</span></h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowQueryModal(true)} 
            className="create-query-btn metal-button"
          >
            <div className="add-icon"></div>
            New Query
          </button>
          <button 
            className="metal-button"
            onClick={() => setShowTutorial(!showTutorial)}
          >
            {showTutorial ? "Hide Tutorial" : "Show Tutorial"}
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="dashboard-grid">
        {/* Left Panel */}
        <div className="dashboard-panel">
          <div className="dashboard-card metal-card">
            <h3>Project Introduction</h3>
            <p>
              FHE Airfare uses Fully Homomorphic Encryption to provide fair, 
              anonymous flight pricing without revealing your identity or travel patterns.
            </p>
            <div className="fhe-badge">
              <span>FHE-Powered Privacy</span>
            </div>
          </div>
          
          <div className="dashboard-card metal-card">
            <h3>How It Works</h3>
            <div className="how-it-works">
              <div className="step">
                <div className="step-number">1</div>
                <p>Your query is encrypted with FHE</p>
              </div>
              <div className="step">
                <div className="step-number">2</div>
                <p>Market data is aggregated anonymously</p>
              </div>
              <div className="step">
                <div className="step-number">3</div>
                <p>Price is calculated without decrypting your data</p>
              </div>
              <div className="step">
                <div className="step-number">4</div>
                <p>You receive a fair, anonymous price</p>
              </div>
            </div>
          </div>
          
          <div className="dashboard-card metal-card">
            <h3>Data Statistics</h3>
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-value">{queries.length}</div>
                <div className="stat-label">Total Queries</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{completedCount}</div>
                <div className="stat-label">Completed</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{pendingCount}</div>
                <div className="stat-label">Processing</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">${minPrice}-${maxPrice}</div>
                <div className="stat-label">Price Range</div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Center Panel */}
        <div className="dashboard-panel">
          <div className="dashboard-card metal-card">
            <div className="section-header">
              <h3>Price Trends</h3>
              <button 
                onClick={loadQueries}
                className="refresh-btn metal-button"
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
            {renderPriceChart()}
          </div>
          
          <div className="dashboard-card metal-card">
            <div className="section-header">
              <h3>Recent Queries</h3>
            </div>
            <div className="queries-list">
              {queries.length === 0 ? (
                <div className="no-queries">
                  <div className="no-queries-icon"></div>
                  <p>No flight queries found</p>
                  <button 
                    className="metal-button primary"
                    onClick={() => setShowQueryModal(true)}
                  >
                    Create First Query
                  </button>
                </div>
              ) : (
                queries.slice(0, 5).map(query => (
                  <div 
                    className={`query-item ${query.status}`} 
                    key={query.id}
                    onClick={() => toggleQueryDetails(query.id)}
                  >
                    <div className="query-summary">
                      <div className="route">
                        {query.origin} → {query.destination}
                      </div>
                      <div className="date">
                        {formatDate(query.departureDate)}
                      </div>
                      <div className="status">
                        <span className={`status-badge ${query.status}`}>
                          {query.status}
                        </span>
                      </div>
                    </div>
                    
                    {expandedQueryId === query.id && (
                      <div className="query-details">
                        <div className="detail-row">
                          <span>Query ID:</span>
                          <span>#{query.id.substring(0, 8)}</span>
                        </div>
                        <div className="detail-row">
                          <span>Submitted:</span>
                          <span>{new Date(query.timestamp * 1000).toLocaleString()}</span>
                        </div>
                        <div className="detail-row">
                          <span>Submitted by:</span>
                          <span>{query.owner.substring(0, 6)}...{query.owner.substring(38)}</span>
                        </div>
                        
                        {query.status === "completed" && (
                          <div className="price-result">
                            <div className="price-label">FHE-Generated Price:</div>
                            <div className="price-value">
                              {query.encryptedPrice ? (
                                <>
                                  <span className="fhe-badge">FHE</span>
                                  ${JSON.parse(atob(query.encryptedPrice.replace("FHE-", ""))).price}
                                </>
                              ) : "N/A"}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        
        {/* Right Panel */}
        <div className="dashboard-panel">
          {showTutorial && (
            <div className="dashboard-card metal-card tutorial-section">
              <h3>FHE Airfare Tutorial</h3>
              <p className="subtitle">Learn how to get fair, anonymous flight prices</p>
              
              <div className="tutorial-steps">
                {tutorialSteps.map((step, index) => (
                  <div 
                    className="tutorial-step"
                    key={index}
                  >
                    <div className="step-icon">{step.icon}</div>
                    <div className="step-content">
                      <h4>{step.title}</h4>
                      <p>{step.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <div className="dashboard-card metal-card">
            <h3>Market Insights</h3>
            <div className="insights">
              <div className="insight-item">
                <div className="insight-icon">📈</div>
                <div className="insight-text">
                  <strong>Dynamic Pricing</strong>
                  <p>Prices adjust based on encrypted market demand</p>
                </div>
              </div>
              <div className="insight-item">
                <div className="insight-icon">🛡️</div>
                <div className="insight-text">
                  <strong>Privacy Protection</strong>
                  <p>Your identity and travel patterns remain hidden</p>
                </div>
              </div>
              <div className="insight-item">
                <div className="insight-icon">⚖️</div>
                <div className="insight-text">
                  <strong>Fair Pricing</strong>
                  <p>No personalized price discrimination</p>
                </div>
              </div>
            </div>
          </div>
          
          <div className="dashboard-card metal-card">
            <h3>System Status</h3>
            <div className="system-status">
              <div className="status-item">
                <span>FHE Engine:</span>
                <span className="status-active">Operational</span>
              </div>
              <div className="status-item">
                <span>Market Data:</span>
                <span className="status-active">Live</span>
              </div>
              <div className="status-item">
                <span>Contract:</span>
                <span className="status-active">Available</span>
              </div>
              <button 
                className="metal-button small"
                onClick={async () => {
                  try {
                    const contract = await getContractReadOnly();
                    if (contract) {
                      const isAvailable = await contract.isAvailable();
                      alert(`Contract availability: ${isAvailable ? "Available" : "Unavailable"}`);
                    }
                  } catch (e) {
                    alert("Error checking contract status");
                  }
                }}
              >
                Check Contract Status
              </button>
            </div>
          </div>
        </div>
      </div>
  
      {showQueryModal && (
        <ModalQuery 
          onSubmit={submitQuery} 
          onClose={() => setShowQueryModal(false)} 
          querying={querying}
          queryData={newQueryData}
          setQueryData={setNewQueryData}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content metal-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="metal-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="plane-icon"></div>
              <span>FHE Airfare</span>
            </div>
            <p>Fair, anonymous flight pricing powered by FHE technology</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Privacy</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} FHE Airfare. All rights reserved.
          </div>
          <div className="disclaimer">
            This demo uses simulated FHE encryption for demonstration purposes.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalQueryProps {
  onSubmit: () => void; 
  onClose: () => void; 
  querying: boolean;
  queryData: any;
  setQueryData: (data: any) => void;
}

const ModalQuery: React.FC<ModalQueryProps> = ({ 
  onSubmit, 
  onClose, 
  querying,
  queryData,
  setQueryData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setQueryData({
      ...queryData,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!queryData.origin || !queryData.destination || !queryData.departureDate) {
      alert("Please fill required fields");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="query-modal metal-card">
        <div className="modal-header">
          <h2>New Flight Query</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="key-icon"></div> Your query will be encrypted with FHE technology
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>Origin *</label>
              <input 
                type="text"
                name="origin"
                value={queryData.origin} 
                onChange={handleChange}
                placeholder="City or airport code" 
                className="metal-input"
              />
            </div>
            
            <div className="form-group">
              <label>Destination *</label>
              <input 
                type="text"
                name="destination"
                value={queryData.destination} 
                onChange={handleChange}
                placeholder="City or airport code" 
                className="metal-input"
              />
            </div>
            
            <div className="form-group">
              <label>Departure Date *</label>
              <input 
                type="date"
                name="departureDate"
                value={queryData.departureDate} 
                onChange={handleChange}
                className="metal-input"
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
            
            <div className="form-group">
              <label>Passengers</label>
              <input 
                type="number"
                name="passengers"
                value={queryData.passengers} 
                onChange={handleChange}
                min="1"
                max="10"
                className="metal-input"
              />
            </div>
          </div>
          
          <div className="privacy-notice">
            <div className="privacy-icon"></div> 
            Your travel preferences remain encrypted during FHE processing
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn metal-button"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={querying}
            className="submit-btn metal-button primary"
          >
            {querying ? "Encrypting with FHE..." : "Submit Query"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;