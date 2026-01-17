![Lunark](./assets/icon-text-light.svg)

Making blockchain human-friendly with Lunark Agent. Interact with the blockchain using natural language. Check balances, transfer funds, or analyze market trends. Powered by [Astreus AI](https://astreus.org) framework.

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Installation

```bash
npm install
cp .env.example .env
npm run prisma:migrate
npm run dev
```

## Basic Usage

```bash
# Create a new chat
curl -X POST http://localhost:4545/api/chat \
  -H "Authorization: Bearer <token>"

# Send a message
curl -X POST http://localhost:4545/api/message \
  -H "Authorization: Bearer <token>" \
  -d '{"chatId": "...", "content": "Check my ETH balance"}'
```

## Core Features

- **Astreus AI Integration**: Advanced agent framework with plugin system and built-in memory
- **20+ Blockchain Networks**: Ethereum, Polygon, BSC, Arbitrum, Optimism, Base, and more
- **12 AI Tools**: Token transfers, balance checks, contacts, memory storage
- **Real-time Streaming**: SSE and Socket.IO support for live responses
- **Secure Architecture**: JWT auth, encryption, rate limiting, helmet protection
- **Docker Ready**: Easy deployment with docker-compose

## Documentation

For detailed documentation and API reference, visit:
- [Official Documentation](https://berkekiran.com/products/lunark)
- [Astreus Framework](https://astreus.org/docs)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contact

Lunark AI Team - [https://berkekiran.com/products/lunark](https://berkekiran.com/products/lunark)

Project Link: [https://github.com/berkekiran/lunark](https://github.com/berkekiran/lunark)
