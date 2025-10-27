interface DepositOptions {
    amount: string;
    keypair?: string;
    network?: string;
    url?: string;
}
export declare function depositCommand(options: DepositOptions): Promise<void>;
export {};
//# sourceMappingURL=deposit.d.ts.map