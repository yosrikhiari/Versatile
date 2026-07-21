using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.RevisionComments.Commands;

public record UpdateRevisionCommentCommand(Guid Id, int? ParagraphIndex, int? StartOffset, int? EndOffset, string? SelectedText, string? Comment, bool? Resolved, Guid? OrganizationId, Guid UserId) : IRequest<RevisionCommentDto>, IRequiresOrganization;
