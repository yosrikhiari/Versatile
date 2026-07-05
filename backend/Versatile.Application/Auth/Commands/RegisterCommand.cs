using MediatR;
using Versatile.Application.DTOs;

namespace Versatile.Application.Auth.Commands;

public record RegisterCommand(string Email, string Username, string Password) : IRequest<AuthResponse>;

public record LoginCommand(string Email, string Password) : IRequest<AuthResponse>;

public record RefreshTokenCommand(string RefreshToken) : IRequest<AuthResponse>;
