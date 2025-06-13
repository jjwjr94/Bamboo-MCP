# Contributing to Bamboo MCP Gateway

Thank you for your interest in contributing to Bamboo MCP Gateway! This document provides guidelines and information for contributors.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Contributing Process](#contributing-process)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Documentation](#documentation)
- [Community](#community)

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## Getting Started

### Prerequisites

- Node.js 18+ or 20+
- Docker and Docker Compose
- Git
- PostgreSQL 15+ (for local development)
- Redis 7+ (for local development)

### Development Setup

1. **Fork and Clone**
   ```bash
   git clone https://github.com/YOUR_USERNAME/bamboo-mcp.git
   cd bamboo-mcp
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start Development Environment**
   ```bash
   docker-compose up -d postgres redis
   npm run dev
   ```

5. **Run Tests**
   ```bash
   npm test
   ./scripts/test.sh
   ```

## Contributing Process

### 1. Create an Issue

Before starting work, please create an issue to discuss:
- Bug reports
- Feature requests
- Documentation improvements
- Performance enhancements

### 2. Fork and Branch

1. Fork the repository
2. Create a feature branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

### 3. Make Changes

- Follow our [coding standards](#coding-standards)
- Write tests for new functionality
- Update documentation as needed
- Ensure all tests pass

### 4. Commit Guidelines

Use conventional commits format:
```
type(scope): description

[optional body]

[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes
- `refactor`: Code refactoring
- `test`: Test changes
- `chore`: Build/tooling changes

Examples:
```bash
git commit -m "feat(auth): add Pipeboard authentication support"
git commit -m "fix(proxy): handle connection timeouts gracefully"
git commit -m "docs(readme): update deployment instructions"
```

### 5. Submit Pull Request

1. Push your branch to your fork
2. Create a pull request against `main`
3. Fill out the PR template completely
4. Ensure CI checks pass
5. Respond to review feedback

## Coding Standards

### TypeScript

- Use TypeScript for all new code
- Enable strict mode
- Provide type annotations for public APIs
- Use meaningful variable and function names

### Code Style

- Use Prettier for formatting
- Follow ESLint rules
- Use 2 spaces for indentation
- Maximum line length: 100 characters

### File Organization

```
src/
├── auth/           # Authentication services
├── core/           # Core gateway functionality
├── proxy/          # Upstream proxy implementations
├── resources/      # Resource and prompt management
├── types/          # TypeScript type definitions
└── index.ts        # Application entry point
```

### Naming Conventions

- **Files**: kebab-case (`auth-service.ts`)
- **Classes**: PascalCase (`AuthService`)
- **Functions**: camelCase (`authenticateUser`)
- **Constants**: UPPER_SNAKE_CASE (`JWT_SECRET`)
- **Interfaces**: PascalCase with `I` prefix (`IUserProfile`)

## Testing

### Test Types

1. **Unit Tests**: Test individual functions/classes
2. **Integration Tests**: Test component interactions
3. **End-to-End Tests**: Test complete workflows

### Writing Tests

- Use Jest for unit and integration tests
- Write tests for all new functionality
- Maintain >80% code coverage
- Test both success and error cases

### Running Tests

```bash
# All tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage

# Integration tests
./scripts/test.sh
```

## Documentation

### Types of Documentation

1. **Code Comments**: Explain complex logic
2. **API Documentation**: Document all public APIs
3. **README Updates**: Keep README current
4. **Examples**: Provide usage examples

### Documentation Standards

- Use JSDoc for function documentation
- Update README for new features
- Include examples in documentation
- Keep documentation in sync with code

## Architecture Guidelines

### Core Principles

1. **Modularity**: Keep components loosely coupled
2. **Type Safety**: Use TypeScript effectively
3. **Error Handling**: Handle errors gracefully
4. **Performance**: Optimize for scalability
5. **Security**: Follow security best practices

### Adding New Features

1. **Authentication**: Extend `AuthService`
2. **MCP Tools**: Add to appropriate proxy
3. **Database**: Use existing connection patterns
4. **Caching**: Leverage Redis appropriately

## Security Considerations

- Never commit secrets or credentials
- Use parameterized queries for database operations
- Validate all input data
- Follow OWASP security guidelines
- Report security issues privately

## Performance Guidelines

- Use caching appropriately
- Optimize database queries
- Monitor memory usage
- Profile performance-critical code
- Consider rate limiting implications

## Release Process

### Version Numbering

We follow [Semantic Versioning](https://semver.org/):
- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes (backward compatible)

### Release Checklist

- [ ] All tests pass
- [ ] Documentation updated
- [ ] CHANGELOG updated
- [ ] Version bumped
- [ ] Security review completed
- [ ] Performance testing done

## Community

### Getting Help

- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: Questions and community discussion
- **Documentation**: Check README and examples first

### Communication Guidelines

- Be respectful and inclusive
- Provide clear, detailed information
- Search existing issues before creating new ones
- Use appropriate labels and templates

## Recognition

Contributors will be recognized in:
- README contributors section
- Release notes
- GitHub contributors page

Thank you for contributing to Bamboo MCP Gateway! 🎉

