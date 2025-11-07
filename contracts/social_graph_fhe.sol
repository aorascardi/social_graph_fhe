pragma solidity ^0.8.24;

import { FHE, euint32, externalEuint32 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract SocialGraphFHE is ZamaEthereumConfig {
    struct EncryptedConnection {
        euint32 encryptedFriendId;
        uint256 connectionType;
        uint256 timestamp;
    }

    struct UserProfile {
        address owner;
        euint32 encryptedUserId;
        mapping(uint256 => EncryptedConnection) connections;
        uint256[] connectionIds;
    }

    mapping(address => UserProfile) private userProfiles;
    mapping(bytes32 => bool) private encryptedUserIdRegistry;

    event ProfileCreated(address indexed owner, euint32 encryptedUserId);
    event ConnectionAdded(address indexed user, uint256 connectionId);
    event MutualFriendsComputed(address indexed userA, address indexed userB, euint32 encryptedCount);

    modifier onlyProfileOwner() {
        require(msg.sender == userProfiles[msg.sender].owner, "Not profile owner");
        _;
    }

    constructor() ZamaEthereumConfig() {}

    function createProfile(externalEuint32 encryptedUserId, bytes calldata inputProof)
        external
    {
        require(
            userProfiles[msg.sender].owner == address(0),
            "Profile already exists"
        );
        euint32 encryptedId = FHE.fromExternal(encryptedUserId, inputProof);
        require(
            FHE.isInitialized(encryptedId),
            "Invalid encrypted user ID"
        );

        bytes32 encryptedIdHash = keccak256(FHE.toBytes(encryptedId));
        require(
            !encryptedUserIdRegistry[encryptedIdHash],
            "Encrypted user ID already registered"
        );

        userProfiles[msg.sender] = UserProfile({
            owner: msg.sender,
            encryptedUserId: encryptedId
        });
        encryptedUserIdRegistry[encryptedIdHash] = true;

        FHE.allowThis(encryptedId);
        FHE.makePubliclyDecryptable(encryptedId);

        emit ProfileCreated(msg.sender, encryptedId);
    }

    function addConnection(
        externalEuint32 encryptedFriendId,
        bytes calldata inputProof,
        uint256 connectionType
    ) external onlyProfileOwner {
        euint32 encryptedFriend = FHE.fromExternal(encryptedFriendId, inputProof);
        require(
            FHE.isInitialized(encryptedFriend),
            "Invalid encrypted friend ID"
        );

        uint256 connectionId = userProfiles[msg.sender].connectionIds.length;
        userProfiles[msg.sender].connections[connectionId] = EncryptedConnection({
            encryptedFriendId: encryptedFriend,
            connectionType: connectionType,
            timestamp: block.timestamp
        });
        userProfiles[msg.sender].connectionIds.push(connectionId);

        FHE.allowThis(encryptedFriend);
        FHE.makePubliclyDecryptable(encryptedFriend);

        emit ConnectionAdded(msg.sender, connectionId);
    }

    function computeMutualFriends(
        address userA,
        address userB,
        bytes calldata computationProof
    ) external {
        require(userProfiles[userA].owner != address(0), "User A profile not found");
        require(userProfiles[userB].owner != address(0), "User B profile not found");

        euint32[] memory encryptedFriendsA = new euint32[](
            userProfiles[userA].connectionIds.length
        );
        for (uint256 i = 0; i < userProfiles[userA].connectionIds.length; i++) {
            encryptedFriendsA[i] = userProfiles[userA].connections[i].encryptedFriendId;
        }

        euint32[] memory encryptedFriendsB = new euint32[](
            userProfiles[userB].connectionIds.length
        );
        for (uint256 i = 0; i < userProfiles[userB].connectionIds.length; i++) {
            encryptedFriendsB[i] = userProfiles[userB].connections[i].encryptedFriendId;
        }

        euint32 encryptedCount = FHE.computeIntersection(
            encryptedFriendsA,
            encryptedFriendsB,
            computationProof
        );

        FHE.allowThis(encryptedCount);
        FHE.makePubliclyDecryptable(encryptedCount);

        emit MutualFriendsComputed(userA, userB, encryptedCount);
    }

    function getEncryptedUserId(address user)
        external
        view
        returns (euint32)
    {
        require(userProfiles[user].owner != address(0), "Profile not found");
        return userProfiles[user].encryptedUserId;
    }

    function getConnection(
        address user,
        uint256 connectionId
    )
        external
        view
        returns (euint32 encryptedFriendId, uint256 connectionType, uint256 timestamp)
    {
        require(userProfiles[user].owner != address(0), "Profile not found");
        require(
            connectionId < userProfiles[user].connectionIds.length,
            "Invalid connection ID"
        );

        EncryptedConnection storage conn = userProfiles[user].connections[connectionId];
        return (conn.encryptedFriendId, conn.connectionType, conn.timestamp);
    }

    function getConnectionCount(address user)
        external
        view
        returns (uint256)
    {
        require(userProfiles[user].owner != address(0), "Profile not found");
        return userProfiles[user].connectionIds.length;
    }

    function isAvailable() public pure returns (bool) {
        return true;
    }
}


