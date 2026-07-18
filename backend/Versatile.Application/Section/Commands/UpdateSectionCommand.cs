using MediatR;
using Versatile.Application.DTOs;

namespace Versatile.Application.Section.Commands;

public record UpdateSectionCommand(Guid Id, string? Title, string? Summary, string? Content, int? Order, string? Status, string? Tags, Guid UserId) : IRequest<SectionDto>;
