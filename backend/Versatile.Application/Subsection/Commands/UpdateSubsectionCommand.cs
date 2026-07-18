using MediatR;
using Versatile.Application.DTOs;

namespace Versatile.Application.Subsection.Commands;

public record UpdateSubsectionCommand(Guid Id, string? Title, string? Summary, string? Content, int? Order, string? Tags, Guid UserId) : IRequest<SubsectionDto>;
