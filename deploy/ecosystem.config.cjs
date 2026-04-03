module.exports = {
  apps: [
    {
      name: "poker-api",
      cwd: "/opt/poker-app",
      script: "/opt/poker-app/deploy/start-poker-api.sh",
      interpreter: "/bin/bash",
      env: {
        HOST: "0.0.0.0",
        PORT: "3015",
        DATA_DIR: "/opt/poker-app/data",
        CORS_ORIGIN: "https://www.quantart.cn",
      },
    },
  ],
};
