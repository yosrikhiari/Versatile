using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Annotations.Commands;

public record UpdateAnnotationCommand(Guid Id, int? ParagraphIndex, string? ParagraphId, string? Type, string? Original, string? Suggestion, string? Reason, string? Status, Guid? OrganizationId, Guid UserId) : IRequest<AnnotationDto>, IRequiresOrganization;
