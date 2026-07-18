using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Chapters.Commands;

public record UpdateChapterCommand(Guid Id, string? Title, int? Order, string? Status, string? ArcAssignment, Guid? OrganizationId, Guid UserId) : IRequest<ChapterDto>, IRequiresOrganization;
