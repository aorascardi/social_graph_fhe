# Private Social Graph

Private Social Graph is a privacy-preserving application that leverages Zama's Fully Homomorphic Encryption (FHE) technology to enable decentralized applications (dApps) to compute mutual friends without revealing any underlying relationship data.

## The Problem

In the age of social networking, the collection and use of personal data present significant privacy risks. Users' social connections are sensitive, and revealing cleartext data can lead to data monopolization and unwanted exposure of personal relationships. This not only undermines user privacy but also can foster misuse of information for targeted advertising or malicious activities. The desire to maintain privacy while still enabling social interactions creates a pressing need for innovative solutions that can protect personal data.

## The Zama FHE Solution

Zama’s FHE technology allows for computation on encrypted data without requiring decryption, ensuring that sensitive information remains confidential at all times. By using Zama's capabilities, Private Social Graph enables dApps to perform complex queries and calculations, such as determining common friends among users, while keeping all relationship data encrypted. This is achieved through the following:

- **Computation on encrypted data**: Users' social relationships are encrypted, preventing unauthorized access while still allowing useful computations.
- **Using fhevm to process encrypted inputs**: Leveraging the power of Zama's FHE implementation ensures that social graph computations can occur securely and efficiently.

## Key Features

- 🔒 **Privacy by Design**: Relationships remain confidential through encryption technologies.
- 🤝 **Mutual Friend Computation**: dApps can calculate shared contacts without revealing individual social connections.
- 🌐 **Cross-Platform Compatibility**: Supports integration with various platforms and ensures seamless user experience.
- 🛡️ **Data Ownership**: Users retain control over their own relational data, protecting them from monopolistic practices.
- 📊 **Network Visualization**: Users can visualize their social graphs without exposing their relationship details.

## Technical Architecture & Stack

Private Social Graph utilizes a combination of technologies to deliver a robust and secure solution:

- **Privacy Engine**: Zama’s FHE technologies (fhevm)
- **Smart Contracts**: Solidity for Ethereum-based dApps
- **Frontend Framework**: Any modern JavaScript framework (React, Angular, etc.)
- **Backend**: Node.js for managing user interactions and data processing

## Smart Contract / Core Logic

Below is a simplified example of a smart contract written in Solidity that demonstrates how to leverage Zama's FHE technology to compute mutual friends:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "fhevm.sol"; // Importing Zama's FHE library

contract PrivateSocialGraph {
    struct User {
        uint64 id;
        // other user data
    }

    mapping(uint64 => User) private users;
    
    function computeMutualFriends(uint64 user1Id, uint64 user2Id) public view returns (uint64[] memory) {
        // Using TFHE.add() for secure computations on encrypted data
        // Ensure all operations are conducted on encrypted inputs
        uint64 mutualFriendsCount = TFHE.add(users[user1Id].encryptedFriendsCount, users[user2Id].encryptedFriendsCount);
        return mutualFriendsCount;
    }
}
```

## Directory Structure

Here's the directory structure for the Private Social Graph project:

```
private-social-graph/
│
├── contracts/
│   └── PrivateSocialGraph.sol
│
├── src/
│   ├── index.js
│   ├── app.js
│   └── components/
│       └── SocialGraph.js
│
├── tests/
│   └── PrivateSocialGraph.test.js
│
├── package.json
├── README.md
└── .gitignore
```

## Installation & Setup

To set up the Private Social Graph project, follow these steps:

### Prerequisites

- Node.js installed on your machine
- A suitable Ethereum environment (like Hardhat or Truffle)

### Install Dependencies

Run the following commands to install the necessary packages:

```bash
npm install
npm install fhevm
```

## Build & Run

Once the dependencies are installed, you can build and run the project using:

```bash
npx hardhat compile
npx hardhat run scripts/deploy.js
npm start
```

Replace `scripts/deploy.js` with the path to your deployment script.

## Acknowledgements

We would like to extend our gratitude to Zama for providing the open-source FHE primitives that make this project possible. Their innovative technology enables us to create privacy-preserving solutions that empower users while protecting their sensitive data.


