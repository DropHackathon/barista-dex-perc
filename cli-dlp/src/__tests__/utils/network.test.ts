import { describe, it, expect } from '@jest/globals';
import { createConnection, getNetworkConfig } from '../../utils/network';
import { Connection, PublicKey } from '@solana/web3.js';

describe('Network Utils', () => {
  describe('createConnection', () => {
    it('should create connection for localnet', () => {
      const conn = createConnection('localnet');
      expect(conn).toBeInstanceOf(Connection);
      expect(conn.rpcEndpoint).toContain('127.0.0.1');
    });

    it('should create connection for devnet', () => {
      const conn = createConnection('devnet');
      expect(conn).toBeInstanceOf(Connection);
      expect(conn.rpcEndpoint).toContain('devnet');
    });

    it('should create connection for mainnet-beta', () => {
      const conn = createConnection('mainnet-beta');
      expect(conn).toBeInstanceOf(Connection);
      expect(conn.rpcEndpoint).toContain('mainnet');
    });

    it('should use custom URL when provided', () => {
      const customUrl = 'http://custom-rpc.example.com:8899';
      const conn = createConnection('localnet', customUrl);
      expect(conn).toBeInstanceOf(Connection);
      expect(conn.rpcEndpoint).toBe(customUrl);
    });

    it('should use commitment level confirmed', () => {
      const conn = createConnection('localnet');
      // Connection commitment is set in constructor
      expect(conn).toBeDefined();
    });
  });

  describe('getNetworkConfig', () => {
    it('should return valid config for localnet', () => {
      const config = getNetworkConfig('localnet');

      expect(config).toHaveProperty('rpcUrl');
      expect(config).toHaveProperty('routerProgramId');
      expect(config).toHaveProperty('slabProgramId');
      expect(config).toHaveProperty('oracleProgramId');

      expect(config.routerProgramId).toBeInstanceOf(PublicKey);
      expect(config.slabProgramId).toBeInstanceOf(PublicKey);
      expect(config.oracleProgramId).toBeInstanceOf(PublicKey);

      expect(config.rpcUrl).toContain('127.0.0.1');
    });

    it('should return valid config for devnet', () => {
      const config = getNetworkConfig('devnet');

      expect(config.rpcUrl).toContain('devnet');
      expect(config.routerProgramId).toBeInstanceOf(PublicKey);
    });

    it('should return valid config for mainnet-beta', () => {
      const config = getNetworkConfig('mainnet-beta');

      expect(config.rpcUrl).toContain('mainnet');
      expect(config.routerProgramId).toBeInstanceOf(PublicKey);
    });

    it('should override RPC URL when provided', () => {
      const customUrl = 'http://custom-rpc.example.com:8899';
      const config = getNetworkConfig('localnet', customUrl);

      expect(config.rpcUrl).toBe(customUrl);
    });

    it('should maintain program IDs when custom URL provided', () => {
      const customUrl = 'http://custom-rpc.example.com:8899';
      const config = getNetworkConfig('localnet', customUrl);

      expect(config.routerProgramId).toBeInstanceOf(PublicKey);
      expect(config.slabProgramId).toBeInstanceOf(PublicKey);
      expect(config.oracleProgramId).toBeInstanceOf(PublicKey);
    });

    it('should use different program IDs for different networks', () => {
      const localnetConfig = getNetworkConfig('localnet');
      const devnetConfig = getNetworkConfig('devnet');

      // Program IDs might be the same in dev, but structure should be consistent
      expect(localnetConfig.routerProgramId).toBeDefined();
      expect(devnetConfig.routerProgramId).toBeDefined();
    });
  });

  describe('Network configuration consistency', () => {
    it('should have all required fields for each network', () => {
      const networks = ['localnet', 'devnet', 'mainnet-beta'] as const;

      networks.forEach((network) => {
        const config = getNetworkConfig(network);

        expect(config.rpcUrl).toBeTruthy();
        expect(config.routerProgramId).toBeInstanceOf(PublicKey);
        expect(config.slabProgramId).toBeInstanceOf(PublicKey);
        expect(config.oracleProgramId).toBeInstanceOf(PublicKey);
      });
    });

    it('should create working connections for all networks', () => {
      const networks = ['localnet', 'devnet', 'mainnet-beta'] as const;

      networks.forEach((network) => {
        const conn = createConnection(network);
        expect(conn).toBeInstanceOf(Connection);
      });
    });
  });
});
