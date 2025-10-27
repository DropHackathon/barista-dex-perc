interface WithdrawOptions {
    amount: string;
    force?: boolean;
    keypair?: string;
    network?: string;
    url?: string;
}
export declare function withdrawCommand(options: WithdrawOptions): Promise<void>;
export {};
//# sourceMappingURL=withdraw.d.ts.map