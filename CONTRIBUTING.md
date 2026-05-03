# Contributing to SyncCinema

First off, thank you for considering contributing to SyncCinema! It's people like you that make SyncCinema such a great tool.

## Quick Links

- [Report a Bug](https://github.com/2047327434/SyncCinema/issues/new?template=bug_report.md)
- [Request a Feature](https://github.com/2047327434/SyncCinema/issues/new?template=feature_request.md)
- [Ask a Question](https://github.com/2047327434/SyncCinema/issues/new?template=question.md)

## Development Setup

```bash
git clone https://github.com/2047327434/SyncCinema.git
cd SyncCinema/server
npm install
npm start
```

The server runs at `http://localhost:3001` by default.

## Project Structure

```
server/   → Backend (Express + Socket.io)
admin/    → Admin dashboard
player/   → User-facing player
```

## How to Contribute

### Bug Reports

1. Check if the bug has already been reported in [Issues](https://github.com/2047327434/SyncCinema/issues)
2. If not, create a new issue using the **Bug Report** template
3. Include steps to reproduce, expected behavior, and actual behavior

### Feature Requests

1. Check existing issues and [Roadmap](README.md#roadmap) first
2. Create a new issue using the **Feature Request** template
3. Describe the use case and expected behavior

### Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Test thoroughly
5. Commit with clear messages (`git commit -m 'Add amazing feature'`)
6. Push to your fork (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Code Style

- **JavaScript**: ES6+ with semicolons, 4-space indentation
- **CSS**: BEM-like naming, 4-space indentation
- **HTML**: Semantic elements, accessible markup
- **Security**: Always sanitize user input, escape HTML output, validate URLs

### Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add room password modification
fix: prevent sync loop on remote events
docs: update API reference
style: format player.js
refactor: extract video sync logic
test: add auth middleware tests
chore: update dependencies
```

## Security

If you discover a security vulnerability, please **do not** open a public issue. Instead, email the maintainer directly or use GitHub's private vulnerability reporting.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
