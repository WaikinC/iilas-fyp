// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// Stores opaque reference hashes and SHA-256 digests; operational data remains off-chain.
contract IntegrityRegistry {
    address public immutable administrator;
    mapping(address => bool) public registrars;
    mapping(bytes32 => bytes32) private digests;
    event RegistrarChanged(address indexed account, bool enabled);
    event Registered(bytes32 indexed referenceHash, bytes32 digest, address indexed actor);
    constructor() { administrator = msg.sender; registrars[msg.sender] = true; }
    function setRegistrar(address account, bool enabled) external {
        require(msg.sender == administrator, "Administrator only");
        require(account != address(0), "Invalid account");
        registrars[account] = enabled;
        emit RegistrarChanged(account, enabled);
    }
    function register(bytes32 referenceHash, bytes32 digest) external {
        require(registrars[msg.sender], "Registrar only");
        require(referenceHash != bytes32(0) && digest != bytes32(0), "Empty hash");
        require(digests[referenceHash] == bytes32(0), "Already registered");
        digests[referenceHash] = digest;
        emit Registered(referenceHash, digest, msg.sender);
    }
    function lookup(bytes32 referenceHash) external view returns (bytes32) { return digests[referenceHash]; }
}
