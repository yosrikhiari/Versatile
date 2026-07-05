using MediatR;
using Versatile.Application.DTOs;

namespace Versatile.Application.Auth.Queries;

public record GetUserInfoQuery(Guid UserId) : IRequest<UserInfo>;
