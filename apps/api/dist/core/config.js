import dotenv from "dotenv";
dotenv.config();
export const config = {
    port: Number(process.env.PORT ?? 3015),
    host: process.env.HOST ?? "0.0.0.0",
    corsOrigin: process.env.CORS_ORIGIN ?? "*",
    dataDir: process.env.DATA_DIR ?? "data",
    deepseekApiKey: process.env.DEEPSEEK_API_KEY ?? "",
    deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL ??
        process.env.QUANT_SIGNAL_LLM_BASE_URL ??
        "https://api.deepseek.com",
    deepseekModel: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
};
