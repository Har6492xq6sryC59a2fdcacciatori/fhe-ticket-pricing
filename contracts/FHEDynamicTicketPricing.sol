// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract FHEDynamicTicketPricing is SepoliaConfig {
    struct EncryptedTicketRequest {
        uint256 id;
        euint32 encryptedDemand;   // Encrypted user demand
        euint32 encryptedTimeSlot; // Encrypted flight time slot
        uint256 timestamp;
    }
    
    struct DecryptedTicketPrice {
        string flightId;
        uint256 price;
        bool isRevealed;
    }

    uint256 public requestCount;
    mapping(uint256 => EncryptedTicketRequest) public encryptedRequests;
    mapping(uint256 => DecryptedTicketPrice) public decryptedPrices;
    mapping(string => euint32) private encryptedFlightDemand;
    string[] private flightList;
    mapping(uint256 => uint256) private requestToDecryptId;

    event TicketRequestSubmitted(uint256 indexed id, uint256 timestamp);
    event DecryptionRequested(uint256 indexed id);
    event PriceDecrypted(uint256 indexed id);

    modifier onlyRequester(uint256 requestId) {
        _; // Access control placeholder
    }

    /// @notice Submit encrypted ticket request
    function submitEncryptedTicketRequest(
        euint32 encryptedDemand,
        euint32 encryptedTimeSlot
    ) public {
        requestCount += 1;
        uint256 newId = requestCount;

        encryptedRequests[newId] = EncryptedTicketRequest({
            id: newId,
            encryptedDemand: encryptedDemand,
            encryptedTimeSlot: encryptedTimeSlot,
            timestamp: block.timestamp
        });

        decryptedPrices[newId] = DecryptedTicketPrice({
            flightId: "",
            price: 0,
            isRevealed: false
        });

        emit TicketRequestSubmitted(newId, block.timestamp);
    }

    /// @notice Request decryption of ticket price
    function requestPriceDecryption(uint256 requestId) public onlyRequester(requestId) {
        EncryptedTicketRequest storage req = encryptedRequests[requestId];
        require(!decryptedPrices[requestId].isRevealed, "Already decrypted");

        bytes32 ;
        ciphertexts[0] = FHE.toBytes32(req.encryptedDemand);
        ciphertexts[1] = FHE.toBytes32(req.encryptedTimeSlot);

        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptPrice.selector);
        requestToDecryptId[reqId] = requestId;

        emit DecryptionRequested(requestId);
    }

    /// @notice Callback for decrypted ticket price
    function decryptPrice(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 decryptId = requestToDecryptId[requestId];
        require(decryptId != 0, "Invalid request");

        FHE.checkSignatures(requestId, cleartexts, proof);

        string[] memory results = abi.decode(cleartexts, (string[]));

        decryptedPrices[decryptId].flightId = results[0];
        decryptedPrices[decryptId].price = stringToUint(results[1]);
        decryptedPrices[decryptId].isRevealed = true;

        if (FHE.isInitialized(encryptedFlightDemand[results[0]]) == false) {
            encryptedFlightDemand[results[0]] = FHE.asEuint32(0);
            flightList.push(results[0]);
        }
        encryptedFlightDemand[results[0]] = FHE.add(
            encryptedFlightDemand[results[0]],
            FHE.asEuint32(1)
        );

        emit PriceDecrypted(decryptId);
    }

    function getDecryptedPrice(uint256 requestId) public view returns (
        string memory flightId,
        uint256 price,
        bool isRevealed
    ) {
        DecryptedTicketPrice storage p = decryptedPrices[requestId];
        return (p.flightId, p.price, p.isRevealed);
    }

    function getEncryptedFlightDemand(string memory flightId) public view returns (euint32) {
        return encryptedFlightDemand[flightId];
    }

    function requestFlightDemandDecryption(string memory flightId) public {
        euint32 demand = encryptedFlightDemand[flightId];
        require(FHE.isInitialized(demand), "Flight not found");

        bytes32 ;
        ciphertexts[0] = FHE.toBytes32(demand);

        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptFlightDemand.selector);
        requestToDecryptId[reqId] = bytes32ToUint(keccak256(abi.encodePacked(flightId)));
    }

    function decryptFlightDemand(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 flightHash = requestToDecryptId[requestId];
        string memory flightId = getFlightFromHash(flightHash);

        FHE.checkSignatures(requestId, cleartexts, proof);

        uint32 demand = abi.decode(cleartexts, (uint32));
        // Handle decrypted flight demand as needed
    }

    function bytes32ToUint(bytes32 b) private pure returns (uint256) {
        return uint256(b);
    }

    function getFlightFromHash(uint256 hash) private view returns (string memory) {
        for (uint i = 0; i < flightList.length; i++) {
            if (bytes32ToUint(keccak256(abi.encodePacked(flightList[i]))) == hash) {
                return flightList[i];
            }
        }
        revert("Flight not found");
    }

    function stringToUint(string memory s) private pure returns (uint256) {
        bytes memory b = bytes(s);
        uint256 result = 0;
        for (uint i = 0; i < b.length; i++) {
            require(b[i] >= 0x30 && b[i] <= 0x39, "Invalid char");
            result = result * 10 + (uint8(b[i]) - 48);
        }
        return result;
    }
}
