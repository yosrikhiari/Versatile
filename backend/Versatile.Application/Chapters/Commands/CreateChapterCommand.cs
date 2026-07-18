using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Chapters.Commands;

public record CreateChapterCommand(Guid StoryId, string Title, int Order, string? ArcAssignment, Guid? OrganizationId, Guid UserId) : IRequest<ChapterDto>, IRequiresOrganization;
